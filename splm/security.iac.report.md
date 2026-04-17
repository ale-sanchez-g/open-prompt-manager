checkov \
    -d terraform \
    --framework terraform \
    --skip-check "" \
    --soft-fail-on LOW,MEDIUM \
    --hard-fail-on HIGH,CRITICAL
  shell: /usr/bin/bash -e {0}
  env:
    pythonLocation: /opt/hostedtoolcache/Python/3.11.15/x64
    PKG_CONFIG_PATH: /opt/hostedtoolcache/Python/3.11.15/x64/lib/pkgconfig
    Python_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
    Python2_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
    Python3_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
    LD_LIBRARY_PATH: /opt/hostedtoolcache/Python/3.11.15/x64/lib


       _               _              
   ___| |__   ___  ___| | _______   __
  / __| '_ \ / _ \/ __| |/ / _ \ \ / /
 | (__| | | |  __/ (__|   < (_) \ V / 
  \___|_| |_|\___|\___|_|\_\___/ \_/  
                                      
By Prisma Cloud | version: 3.2.216 
Update available 3.2.216 -> 3.2.521
Run pip3 install -U checkov to update 


terraform scan results:

Passed checks: 89, Failed checks: 34, Skipped checks: 0, Parsing errors: 1

Check: CKV_AWS_328: "Ensure that ALB is configured with defensive or strictest desync mitigation mode"
	PASSED for resource: aws_lb.main
	File: /alb.tf:5-19
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/bc-aws-328
Check: CKV_AWS_261: "Ensure HTTP HTTPS Target group defines Healthcheck"
	PASSED for resource: aws_lb_target_group.frontend
	File: /alb.tf:24-48
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/ensure-aws-kendra-index-server-side-encryption-uses-customer-managed-keys-cmks
Check: CKV_AWS_261: "Ensure HTTP HTTPS Target group defines Healthcheck"
	PASSED for resource: aws_lb_target_group.backend
	File: /alb.tf:50-74
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/ensure-aws-kendra-index-server-side-encryption-uses-customer-managed-keys-cmks
Check: CKV_AWS_163: "Ensure ECR image scanning on push is enabled"
	PASSED for resource: aws_ecr_repository.backend
	File: /ecr.tf:4-18
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/general-8
Check: CKV_AWS_163: "Ensure ECR image scanning on push is enabled"
		8  |   load_balancer_type = "application"
		9  |   security_groups    = [aws_security_group.alb.id]
		10 |   subnets            = aws_subnet.public[*].id
		11 | 
		12 |   enable_deletion_protection = false
		13 | 
		14 |   tags = {
		15 |     Name        = "${var.project_name}-alb"
		16 |     Project     = var.project_name
		17 |     Environment = var.environment
		18 |   }
		19 | }

Check: CKV_AWS_103: "Ensure that load balancer is using at least TLS 1.2"
	FAILED for resource: aws_lb_listener.http
	File: /alb.tf:79-100
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-general-43

		79  | resource "aws_lb_listener" "http" {
		80  |   load_balancer_arn = aws_lb.main.arn
		81  |   port              = 80
		82  |   protocol          = "HTTP"
		83  | 
		84  |   default_action {
		85  |     type = var.enable_https ? "redirect" : "forward"
		86  | 
		87  |     # If HTTPS is enabled, redirect all HTTP to HTTPS
		88  |     dynamic "redirect" {
		89  |       for_each = var.enable_https ? [1] : []
		90  |       content {
		91  |         port        = "443"
		92  |         protocol    = "HTTPS"
		93  |         status_code = "HTTP_301"
		94  |       }
		95  |     }
		96  | 
		97  |     # If HTTPS is disabled, forward to frontend
		98  |     target_group_arn = var.enable_https ? null : aws_lb_target_group.frontend.arn
		99  |   }
		100 | }

Error parsing file /home/runner/work/open-prompt-manager/open-prompt-manager/terraform/certificate.tfֿ