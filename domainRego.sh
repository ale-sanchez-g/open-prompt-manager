#!/usr/bin/env bash
set -euo pipefail

# Domain registration helper for AWS Route 53 Domains.
# Dry-run by default. Use --execute to actually place a registration order.

# Defaults (can be overridden by environment variables and then by CLI flags)
AWS_REGION="${AWS_REGION:-us-east-1}"
DURATION_YEARS="${DURATION_YEARS:-1}"
AUTO_RENEW="${AUTO_RENEW:-true}"
PRIVACY_PROTECT_ADMIN="${PRIVACY_PROTECT_ADMIN:-true}"
PRIVACY_PROTECT_REGISTRANT="${PRIVACY_PROTECT_REGISTRANT:-true}"
PRIVACY_PROTECT_TECH="${PRIVACY_PROTECT_TECH:-true}"

CONTACT_TYPE="${CONTACT_TYPE:-PERSON}"
COUNTRY_CODE="${COUNTRY_CODE:-US}"

FIRST_NAME="${FIRST_NAME:-}"
LAST_NAME="${LAST_NAME:-}"
ORG_NAME="${ORG_NAME:-}"
EMAIL="${EMAIL:-}"
PHONE="${PHONE:-}"
ADDRESS_1="${ADDRESS_1:-}"
ADDRESS_2="${ADDRESS_2:-}"
CITY="${CITY:-}"
STATE="${STATE:-}"
ZIP_CODE="${ZIP_CODE:-}"

DOMAIN_NAME="${DOMAIN_NAME:-}"
OPERATION_ID=""
EXECUTE="false"

log()  { echo ""; echo "> $*"; }
ok()   { echo "  [ok] $*"; }
warn() { echo "  [warn] $*"; }
fail() { echo "  [error] $*" >&2; exit 1; }

usage() {
	cat <<'EOF'
Usage:
	./domainRego.sh [options]

Examples:
	# Dry-run with explicit contact details
	./domainRego.sh \
		--domain opm-dx1.com \
		--first-name Alejandro \
		--last-name Sanchez \
		--email ale@example.com \
		--phone +1.2065550100 \
		--address-1 "123 Main St" \
		--city Seattle \
		--state WA \
		--zip 98101 \
		--country US

	# Actually submit the registration request
	./domainRego.sh --domain opm-dx1.com --execute [other required options]

	# Check registration operation status
	./domainRego.sh --check-operation <operation-id>

Options:
	--domain <name>                Domain to register (e.g., example.com)
	--duration-years <1-10>        Registration duration in years (default: 1)
	--auto-renew <true|false>      Auto-renew domain (default: true)
	--region <aws-region>          AWS region for Route53Domains API (default: us-east-1)

	--first-name <value>           Contact first name
	--last-name <value>            Contact last name
	--org-name <value>             Organization name (optional for PERSON)
	--contact-type <PERSON|COMPANY|ASSOCIATION|PUBLIC_BODY|RESELLER>
																	(default: PERSON)
	--email <value>                Contact email
	--phone <value>                E.164 phone (e.g., +1.2065550100)
	--address-1 <value>            Address line 1
	--address-2 <value>            Address line 2 (optional)
	--city <value>                 City
	--state <value>                State/Province
	--zip <value>                  Postal code
	--country <2-letter-code>      Country code (default: US)

	--privacy-admin <true|false>       Privacy protect admin contact (default: true)
	--privacy-registrant <true|false>  Privacy protect registrant contact (default: true)
	--privacy-tech <true|false>        Privacy protect tech contact (default: true)

	--execute                      Submit registration (without this, script only dry-runs)
	--check-operation <id>         Check Route53Domains operation status and exit
	--help                         Show this help message

Environment variable defaults are also supported:
	DOMAIN_NAME, FIRST_NAME, LAST_NAME, ORG_NAME, EMAIL, PHONE,
	ADDRESS_1, ADDRESS_2, CITY, STATE, ZIP_CODE, COUNTRY_CODE,
	CONTACT_TYPE, AWS_REGION, DURATION_YEARS, AUTO_RENEW
EOF
}

bool_or_fail() {
	local name="$1"
	local value="$2"
	case "$value" in
		true|false) ;;
		*) fail "$name must be true or false (got: $value)" ;;
	esac
}

validate_required() {
	[[ -n "$DOMAIN_NAME" ]] || fail "--domain is required"
	[[ -n "$FIRST_NAME" ]] || fail "--first-name is required"
	[[ -n "$LAST_NAME" ]] || fail "--last-name is required"
	[[ -n "$EMAIL" ]] || fail "--email is required"
	[[ -n "$PHONE" ]] || fail "--phone is required"
	[[ -n "$ADDRESS_1" ]] || fail "--address-1 is required"
	[[ -n "$CITY" ]] || fail "--city is required"
	[[ -n "$STATE" ]] || fail "--state is required"
	[[ -n "$ZIP_CODE" ]] || fail "--zip is required"
	[[ -n "$COUNTRY_CODE" ]] || fail "--country is required"

	if ! [[ "$DURATION_YEARS" =~ ^[0-9]+$ ]] || [[ "$DURATION_YEARS" -lt 1 ]] || [[ "$DURATION_YEARS" -gt 10 ]]; then
		fail "--duration-years must be an integer from 1 to 10"
	fi

	if ! [[ "$COUNTRY_CODE" =~ ^[A-Z]{2}$ ]]; then
		fail "--country must be a 2-letter ISO code (e.g., AU, US, GB)"
	fi

	bool_or_fail "--auto-renew" "$AUTO_RENEW"
	bool_or_fail "--privacy-admin" "$PRIVACY_PROTECT_ADMIN"
	bool_or_fail "--privacy-registrant" "$PRIVACY_PROTECT_REGISTRANT"
	bool_or_fail "--privacy-tech" "$PRIVACY_PROTECT_TECH"
}

check_prereqs() {
	command -v aws >/dev/null 2>&1 || fail "aws CLI not found"
	aws sts get-caller-identity >/dev/null 2>&1 || fail "AWS credentials not configured or invalid"
}

check_domain_availability() {
	log "Checking domain availability for $DOMAIN_NAME"
	local status
	status=$(aws route53domains check-domain-availability \
		--domain-name "$DOMAIN_NAME" \
		--region "$AWS_REGION" \
		--query 'Availability' \
		--output text)

	case "$status" in
		AVAILABLE)
			ok "Domain is AVAILABLE"
			;;
		*)
			fail "Domain is not available (status: $status)"
			;;
	esac
}

write_contact_json() {
	local out_file="$1"

	cat > "$out_file" <<EOF
{
	"FirstName": "${FIRST_NAME}",
	"LastName": "${LAST_NAME}",
	"ContactType": "${CONTACT_TYPE}",
	"OrganizationName": "${ORG_NAME}",
	"Email": "${EMAIL}",
	"PhoneNumber": "${PHONE}",
	"AddressLine1": "${ADDRESS_1}",
	"AddressLine2": "${ADDRESS_2}",
	"City": "${CITY}",
	"State": "${STATE}",
	"CountryCode": "${COUNTRY_CODE}",
	"ZipCode": "${ZIP_CODE}"
}
EOF
}

register_domain() {
	local contact_file
	contact_file=$(mktemp)
	trap 'rm -f "$contact_file"' EXIT

	write_contact_json "$contact_file"

	local auto_renew_flag="--auto-renew"
	local privacy_admin_flag="--privacy-protect-admin-contact"
	local privacy_registrant_flag="--privacy-protect-registrant-contact"
	local privacy_tech_flag="--privacy-protect-tech-contact"

	[[ "$AUTO_RENEW" == "true" ]] || auto_renew_flag="--no-auto-renew"
	[[ "$PRIVACY_PROTECT_ADMIN" == "true" ]] || privacy_admin_flag="--no-privacy-protect-admin-contact"
	[[ "$PRIVACY_PROTECT_REGISTRANT" == "true" ]] || privacy_registrant_flag="--no-privacy-protect-registrant-contact"
	[[ "$PRIVACY_PROTECT_TECH" == "true" ]] || privacy_tech_flag="--no-privacy-protect-tech-contact"

	log "Submitting Route53 domain registration request"
	local operation_id
	operation_id=$(aws route53domains register-domain \
		--region "$AWS_REGION" \
		--domain-name "$DOMAIN_NAME" \
		--duration-in-years "$DURATION_YEARS" \
		"$auto_renew_flag" \
		"$privacy_admin_flag" \
		"$privacy_registrant_flag" \
		"$privacy_tech_flag" \
		--admin-contact "file://$contact_file" \
		--registrant-contact "file://$contact_file" \
		--tech-contact "file://$contact_file" \
		--query 'OperationId' \
		--output text)

	ok "Registration request submitted. OperationId: $operation_id"
	echo ""
	echo "Track status with:"
	echo "  ./domainRego.sh --check-operation $operation_id"
}

check_operation_status() {
	[[ -n "$OPERATION_ID" ]] || fail "--check-operation requires an operation id"

	log "Checking operation status: $OPERATION_ID"
	aws route53domains get-operation-detail \
		--operation-id "$OPERATION_ID" \
		--region "$AWS_REGION" \
		--output table
}

parse_args() {
	while [[ $# -gt 0 ]]; do
		case "$1" in
			--domain) DOMAIN_NAME="$2"; shift 2 ;;
			--duration-years) DURATION_YEARS="$2"; shift 2 ;;
			--auto-renew) AUTO_RENEW="$2"; shift 2 ;;
			--region) AWS_REGION="$2"; shift 2 ;;

			--first-name) FIRST_NAME="$2"; shift 2 ;;
			--last-name) LAST_NAME="$2"; shift 2 ;;
			--org-name) ORG_NAME="$2"; shift 2 ;;
			--contact-type) CONTACT_TYPE="$2"; shift 2 ;;
			--email) EMAIL="$2"; shift 2 ;;
			--phone) PHONE="$2"; shift 2 ;;
			--address-1) ADDRESS_1="$2"; shift 2 ;;
			--address-2) ADDRESS_2="$2"; shift 2 ;;
			--city) CITY="$2"; shift 2 ;;
			--state) STATE="$2"; shift 2 ;;
			--zip) ZIP_CODE="$2"; shift 2 ;;
			--country) COUNTRY_CODE="$2"; shift 2 ;;

			--privacy-admin) PRIVACY_PROTECT_ADMIN="$2"; shift 2 ;;
			--privacy-registrant) PRIVACY_PROTECT_REGISTRANT="$2"; shift 2 ;;
			--privacy-tech) PRIVACY_PROTECT_TECH="$2"; shift 2 ;;

			--execute) EXECUTE="true"; shift ;;
			--check-operation) OPERATION_ID="$2"; shift 2 ;;
			--help|-h) usage; exit 0 ;;
			*) fail "Unknown option: $1" ;;
		esac
	done
}

print_summary() {
	log "Registration summary"
	echo "  Domain              : $DOMAIN_NAME"
	echo "  Region              : $AWS_REGION"
	echo "  Duration (years)    : $DURATION_YEARS"
	echo "  Auto renew          : $AUTO_RENEW"
	echo "  Contact             : $FIRST_NAME $LAST_NAME"
	echo "  Email               : $EMAIL"
	echo "  Country             : $COUNTRY_CODE"
	echo "  Execute             : $EXECUTE"
}

main() {
	parse_args "$@"
	check_prereqs

	if [[ -n "$OPERATION_ID" ]]; then
		check_operation_status
		exit 0
	fi

	validate_required
	print_summary
	check_domain_availability

	if [[ "$EXECUTE" != "true" ]]; then
		warn "Dry-run mode. Use --execute to submit the registration request."
		exit 0
	fi

	register_domain
}

main "$@"
