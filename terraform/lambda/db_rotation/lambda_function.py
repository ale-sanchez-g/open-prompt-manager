"""AWS Secrets Manager rotation function for the PostgreSQL DATABASE_URL secret.

This rotates the RDS master-user password for a secret whose value is a single
SQLAlchemy/libpq connection string of the form::

    postgresql://<user>:<password>@<host>:<port>/<dbname>

It implements the standard four-step Secrets Manager single-user rotation
contract (``createSecret`` → ``setSecret`` → ``testSecret`` → ``finishSecret``).
The application stores the *whole connection string* in one secret (consumed by
ECS as the ``DATABASE_URL`` environment variable), so — unlike the AWS-provided
templates that expect a structured ``{username, password, host, ...}`` JSON
document — this function parses and rebuilds the URL in place.

The function runs inside the VPC (private subnets) with a security group that is
allowed to reach the RDS instance on 5432, and reaches the Secrets Manager API
through the configured endpoint (NAT gateway or interface VPC endpoint).

Runtime dependency: ``pg8000`` (pure-Python PostgreSQL driver). It must be
packaged with this function — see ``build.sh`` / the deployment docs.
"""

import logging
import os
from contextlib import closing
from urllib.parse import quote, unquote, urlsplit, urlunsplit

import boto3
import pg8000.dbapi
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Characters excluded from generated passwords so the value is always safe to
# embed unescaped between the ":" and "@" of a connection string and to pass
# through libpq. We still percent-encode on top of this for defence in depth.
_EXCLUDE_CHARACTERS = "/@\"'\\ :%"


def _parse_url(url):
    """Split a postgresql:// URL into its component parts.

    Returns a dict with scheme, username, password, host, port, dbname and the
    raw query/params suffix so the URL can be faithfully rebuilt.
    """
    parts = urlsplit(url)
    return {
        "scheme": parts.scheme,
        "username": unquote(parts.username) if parts.username else None,
        "password": unquote(parts.password) if parts.password else None,
        "host": parts.hostname,
        "port": parts.port,
        "dbname": parts.path.lstrip("/"),
        "query": parts.query,
    }


def _build_url(fields, password):
    """Rebuild a postgresql:// URL from parsed fields, swapping in ``password``."""
    user = quote(fields["username"] or "", safe="")
    pw = quote(password or "", safe="")
    host = fields["host"] or ""
    netloc = f"{user}:{pw}@{host}"
    if fields["port"]:
        netloc = f"{netloc}:{fields['port']}"
    path = f"/{fields['dbname']}" if fields["dbname"] else ""
    return urlunsplit((fields["scheme"], netloc, path, fields["query"], ""))


def _connect(url, timeout=5):
    """Open a short-lived PostgreSQL connection from a connection-string URL.

    The caller owns the returned connection and must close it (the rotation
    steps wrap it in ``contextlib.closing``).
    """
    fields = _parse_url(url)
    return pg8000.dbapi.connect(
        user=fields["username"],
        password=fields["password"],
        host=fields["host"],
        port=int(fields["port"] or 5432),
        database=fields["dbname"],
        timeout=timeout,
    )


def lambda_handler(event, context):
    """Entry point invoked by Secrets Manager for each rotation step."""
    arn = event["SecretId"]
    token = event["ClientRequestToken"]
    step = event["Step"]

    endpoint = os.environ["SECRETS_MANAGER_ENDPOINT"]
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")
    service = boto3.client("secretsmanager", endpoint_url=endpoint, region_name=region)

    try:
        metadata = service.describe_secret(SecretId=arn)
    except ClientError as exc:
        logger.error("describeSecret failed: %s", _error_code(exc))
        raise

    if not metadata.get("RotationEnabled", False):
        raise ValueError(f"Secret {arn} is not enabled for rotation")

    versions = metadata["VersionIdsToStages"]
    if token not in versions:
        raise ValueError(f"Secret version {token} has no stage for rotation of {arn}")
    if "AWSCURRENT" in versions[token]:
        logger.info("Requested version is already AWSCURRENT; nothing to rotate")
        return
    if "AWSPENDING" not in versions[token]:
        raise ValueError(f"Secret version {token} not AWSPENDING for rotation of {arn}")

    if step == "createSecret":
        _create_secret(service, arn, token)
    elif step == "setSecret":
        _set_secret(service, arn, token)
    elif step == "testSecret":
        _test_secret(service, arn, token)
    elif step == "finishSecret":
        _finish_secret(service, arn, token)
    else:
        raise ValueError(f"Invalid step parameter: {step}")


def _error_code(exc):
    """Extract the AWS error code from a ClientError for logging without leaking secrets."""
    return exc.response.get("Error", {}).get("Code", "Unknown")


def _create_secret(service, arn, token):
    """Generate a new password and store the candidate URL as AWSPENDING."""
    try:
        current = service.get_secret_value(SecretId=arn, VersionStage="AWSCURRENT")[
            "SecretString"
        ]
        try:
            service.get_secret_value(
                SecretId=arn, VersionId=token, VersionStage="AWSPENDING"
            )
            logger.info("createSecret: AWSPENDING version already exists")
            return
        except service.exceptions.ResourceNotFoundException:
            logger.info("createSecret: no existing AWSPENDING version, creating one")

        fields = _parse_url(current)
        new_password = service.get_random_password(
            PasswordLength=32, ExcludeCharacters=_EXCLUDE_CHARACTERS
        )["RandomPassword"]
        pending_url = _build_url(fields, new_password)

        service.put_secret_value(
            SecretId=arn,
            ClientRequestToken=token,
            SecretString=pending_url,
            VersionStages=["AWSPENDING"],
        )
        logger.info("createSecret: stored new AWSPENDING secret value")
    except ClientError as exc:
        logger.error("createSecret: AWS request failed: %s", _error_code(exc))
        raise


def _set_secret(service, arn, token):
    """Apply the pending password to the database via ALTER USER."""
    try:
        pending = service.get_secret_value(
            SecretId=arn, VersionId=token, VersionStage="AWSPENDING"
        )["SecretString"]
        current = service.get_secret_value(SecretId=arn, VersionStage="AWSCURRENT")[
            "SecretString"
        ]
    except ClientError as exc:
        logger.error("setSecret: AWS request failed: %s", _error_code(exc))
        raise
    pending_fields = _parse_url(pending)

    # First try the pending credentials in case setSecret already ran.
    try:
        with closing(_connect(pending)):
            logger.info("setSecret: pending credentials already active")
            return
    except pg8000.dbapi.DatabaseError:
        logger.info("setSecret: pending credentials not active yet, rotating now")

    with closing(_connect(current)) as conn:
        conn.autocommit = True
        with closing(conn.cursor()) as cur:
            # ALTER USER does not support bound parameters for the role name, so
            # the username is quoted as an identifier; the password is bound
            # safely as a parameter.
            username = pending_fields["username"]
            if not username:
                raise ValueError("DATABASE_URL is missing a username")
            safe_username = username.replace('"', '""')
            cur.execute(
                f'ALTER USER "{safe_username}" WITH PASSWORD %s',
                (pending_fields["password"],),
            )
    logger.info("setSecret: database password updated")


def _test_secret(service, arn, token):
    """Verify the pending credentials can connect and run a trivial query."""
    try:
        pending = service.get_secret_value(
            SecretId=arn, VersionId=token, VersionStage="AWSPENDING"
        )["SecretString"]
    except ClientError as exc:
        logger.error("testSecret: AWS request failed: %s", _error_code(exc))
        raise
    with closing(_connect(pending)) as conn:
        with closing(conn.cursor()) as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
    logger.info("testSecret: pending credentials verified")


def _finish_secret(service, arn, token):
    """Promote the AWSPENDING version to AWSCURRENT."""
    try:
        metadata = service.describe_secret(SecretId=arn)
        current_version = None
        for version, stages in metadata["VersionIdsToStages"].items():
            if "AWSCURRENT" in stages:
                if version == token:
                    logger.info("finishSecret: version already AWSCURRENT")
                    return
                current_version = version
                break

        kwargs = {
            "SecretId": arn,
            "VersionStage": "AWSCURRENT",
            "MoveToVersionId": token,
        }
        if current_version is not None:
            kwargs["RemoveFromVersionId"] = current_version
        service.update_secret_version_stage(**kwargs)
        logger.info("finishSecret: promoted pending version to AWSCURRENT")
    except ClientError as exc:
        logger.error("finishSecret: AWS request failed: %s", _error_code(exc))
        raise
