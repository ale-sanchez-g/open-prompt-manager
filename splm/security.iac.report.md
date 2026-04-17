Run checkov \
  checkov \
    -d terraform \
    --framework terraform \
     \
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

By Prisma Cloud | version: 3.2.521 

terraform scan results:

Passed checks: 95, Failed checks: 39, Skipped checks: 0

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
	PASSED for resource: aws_ecr_repository.frontend
	File: /ecr.tf:44-58
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/general-8
Check: CKV_AWS_66: "Ensure that CloudWatch Log Group specifies retention days"
	PASSED for resource: aws_cloudwatch_log_group.backend
	File: /ecs.tf:4-13
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-logging-policies/logging-13
Check: CKV_AWS_66: "Ensure that CloudWatch Log Group specifies retention days"
	PASSED for resource: aws_cloudwatch_log_group.frontend
	File: /ecs.tf:15-24
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-logging-policies/logging-13
Check: CKV_AWS_65: "Ensure container insights are enabled on ECS cluster"
	PASSED for resource: aws_ecs_cluster.main
	File: /ecs.tf:29-42
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-logging-policies/bc-aws-logging-11
Check: CKV_AWS_223: "Ensure ECS Cluster enables logging of ECS Exec"
	PASSED for resource: aws_ecs_cluster.main
	File: /ecs.tf:29-42
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/ensure-aws-ecs-cluster-enables-logging-of-ecs-exec
Check: CKV_AWS_97: "Ensure Encryption in transit is enabled for EFS volumes in ECS Task definitions"
	PASSED for resource: aws_ecs_task_definition.backend
	File: /ecs.tf:64-130
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-general-39
Check: CKV_AWS_336: "Ensure ECS containers are limited to read-only access to root filesystems"
	PASSED for resource: aws_ecs_task_definition.backend
	File: /ecs.tf:64-130
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-336
Check: CKV_AWS_249: "Ensure that the Execution Role ARN and the Task Role ARN are different in ECS Task definitions"
	PASSED for resource: aws_ecs_task_definition.backend
	File: /ecs.tf:64-130
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/ensure-the-aws-execution-role-arn-and-task-role-arn-are-different-in-ecs-task-definitions
Check: CKV_AWS_333: "Ensure ECS services do not have public IP addresses assigned to them automatically"
	PASSED for resource: aws_ecs_service.backend
	File: /ecs.tf:132-163
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-logging-policies/bc-aws-333
Check: CKV_AWS_332: "Ensure ECS Fargate services run on the latest Fargate platform version"
	PASSED for resource: aws_ecs_service.backend
	File: /ecs.tf:132-163
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-332
Check: CKV_AWS_97: "Ensure Encryption in transit is enabled for EFS volumes in ECS Task definitions"
	PASSED for resource: aws_ecs_task_definition.frontend
	File: /ecs.tf:168-215
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-general-39
Check: CKV_AWS_336: "Ensure ECS containers are limited to read-only access to root filesystems"
	PASSED for resource: aws_ecs_task_definition.frontend
	File: /ecs.tf:168-215
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-336
Check: CKV_AWS_335: "Ensure ECS task definitions should not share the host's process namespace"
	PASSED for resource: aws_ecs_task_definition.frontend
	File: /ecs.tf:168-215
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-335
Check: CKV_AWS_334: "Ensure ECS containers should run as non-privileged"
	PASSED for resource: aws_ecs_task_definition.frontend
	File: /ecs.tf:168-215
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-334
Check: CKV_AWS_249: "Ensure that the Execution Role ARN and the Task Role ARN are different in ECS Task definitions"
	PASSED for resource: aws_ecs_task_definition.frontend
	File: /ecs.tf:168-215
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/ensure-the-aws-execution-role-arn-and-task-role-arn-are-different-in-ecs-task-definitions
Check: CKV_AWS_333: "Ensure ECS services do not have public IP addresses assigned to them automatically"
	PASSED for resource: aws_ecs_service.frontend
	File: /ecs.tf:217-246
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-logging-policies/bc-aws-333
Check: CKV_AWS_332: "Ensure ECS Fargate services run on the latest Fargate platform version"
	PASSED for resource: aws_ecs_service.frontend
	File: /ecs.tf:217-246
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-332
Check: CKV_AWS_111: "Ensure IAM policies does not allow write access without constraints"
	PASSED for resource: aws_iam_policy_document.ecs_task_assume_role
	File: /iam.tf:6-16
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/ensure-iam-policies-do-not-allow-write-access-without-constraint
Check: CKV_AWS_356: "Ensure no IAM policies documents allow "*" as a statement's resource for restrictable actions"
	PASSED for resource: aws_iam_policy_document.ecs_task_assume_role
	File: /iam.tf:6-16
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-356
Check: CKV_AWS_108: "Ensure IAM policies does not allow data exfiltration"
	PASSED for resource: aws_iam_policy_document.ecs_task_assume_role
	File: /iam.tf:6-16
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/ensure-iam-policies-do-not-allow-data-exfiltration
Check: CKV_AWS_49: "Ensure no IAM policies documents allow "*" as a statement's actions"
	PASSED for resource: aws_iam_policy_document.ecs_task_assume_role
	File: /iam.tf:6-16
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-iam-43
Check: CKV_AWS_358: "Ensure AWS GitHub Actions OIDC authorization policies only allow safe claims and claim order"
	PASSED for resource: aws_iam_policy_document.ecs_task_assume_role
	File: /iam.tf:6-16
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/iam-358
Check: CKV_AWS_107: "Ensure IAM policies does not allow credentials exposure"
	PASSED for resource: aws_iam_policy_document.ecs_task_assume_role
	File: /iam.tf:6-16
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/ensure-iam-policies-do-not-allow-credentials-exposure
Check: CKV_AWS_110: "Ensure IAM policies does not allow privilege escalation"
	PASSED for resource: aws_iam_policy_document.ecs_task_assume_role
	File: /iam.tf:6-16
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/ensure-iam-policies-does-not-allow-privilege-escalation
Check: CKV_AWS_1: "Ensure IAM policies that allow full "*-*" administrative privileges are not created"
	PASSED for resource: aws_iam_policy_document.ecs_task_assume_role
	File: /iam.tf:6-16
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/iam-23
Check: CKV_AWS_109: "Ensure IAM policies does not allow permissions management / resource exposure without constraints"
	PASSED for resource: aws_iam_policy_document.ecs_task_assume_role
	File: /iam.tf:6-16
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/ensure-iam-policies-do-not-allow-permissions-management-resource-exposure-without-constraint
Check: CKV_AWS_283: "Ensure no IAM policies documents allow ALL or any AWS principal permissions to the resource"
	PASSED for resource: aws_iam_policy_document.ecs_task_assume_role
	File: /iam.tf:6-16
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-283
Check: CKV_AWS_60: "Ensure IAM role allows only specific services or principals to assume it"
	PASSED for resource: aws_iam_role.ecs_task_execution
	File: /iam.tf:18-27
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-iam-44
Check: CKV_AWS_274: "Disallow IAM roles, users, and groups from using the AWS AdministratorAccess policy"
	PASSED for resource: aws_iam_role.ecs_task_execution
	File: /iam.tf:18-27
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-274
Check: CKV_AWS_61: "Ensure AWS IAM policy does not allow assume role permission across all services"
	PASSED for resource: aws_iam_role.ecs_task_execution
	File: /iam.tf:18-27
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-iam-45
Check: CKV_AWS_274: "Disallow IAM roles, users, and groups from using the AWS AdministratorAccess policy"
	PASSED for resource: aws_iam_role_policy_attachment.ecs_task_execution
	File: /iam.tf:29-32
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-274
Check: CKV_AWS_60: "Ensure IAM role allows only specific services or principals to assume it"
	PASSED for resource: aws_iam_role.ecs_task
	File: /iam.tf:41-50
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-iam-44
Check: CKV_AWS_274: "Disallow IAM roles, users, and groups from using the AWS AdministratorAccess policy"
	PASSED for resource: aws_iam_role.ecs_task
	File: /iam.tf:41-50
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-274
Check: CKV_AWS_61: "Ensure AWS IAM policy does not allow assume role permission across all services"
	PASSED for resource: aws_iam_role.ecs_task
	File: /iam.tf:41-50
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-iam-45
Check: CKV_AWS_290: "Ensure IAM policies does not allow write access without constraints"
	PASSED for resource: aws_iam_role_policy.ecs_execution_secrets
	File: /iam.tf:57-71
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-290
Check: CKV_AWS_63: "Ensure no IAM policies documents allow "*" as a statement's actions"
	PASSED for resource: aws_iam_role_policy.ecs_execution_secrets
	File: /iam.tf:57-71
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/iam-48
Check: CKV_AWS_288: "Ensure IAM policies does not allow data exfiltration"
	PASSED for resource: aws_iam_role_policy.ecs_execution_secrets
	File: /iam.tf:57-71
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-288
Check: CKV_AWS_287: "Ensure IAM policies does not allow credentials exposure"
	PASSED for resource: aws_iam_role_policy.ecs_execution_secrets
	File: /iam.tf:57-71
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-287
Check: CKV_AWS_355: "Ensure no IAM policies documents allow "*" as a statement's resource for restrictable actions"
	PASSED for resource: aws_iam_role_policy.ecs_execution_secrets
	File: /iam.tf:57-71
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-355
Check: CKV_AWS_286: "Ensure IAM policies does not allow privilege escalation"
	PASSED for resource: aws_iam_role_policy.ecs_execution_secrets
	File: /iam.tf:57-71
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-286
Check: CKV_AWS_62: "Ensure IAM policies that allow full "*-*" administrative privileges are not created"
	PASSED for resource: aws_iam_role_policy.ecs_execution_secrets
	File: /iam.tf:57-71
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-iam-45
Check: CKV_AWS_289: "Ensure IAM policies does not allow permissions management / resource exposure without constraints"
	PASSED for resource: aws_iam_role_policy.ecs_execution_secrets
	File: /iam.tf:57-71
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-289
Check: CKV_AWS_16: "Ensure all data stored in the RDS is securely encrypted at rest"
	PASSED for resource: aws_db_instance.main
	File: /rds.tf:66-100
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/general-4
Check: CKV_AWS_354: "Ensure RDS Performance Insights are encrypted using KMS CMKs"
	PASSED for resource: aws_db_instance.main
	File: /rds.tf:66-100
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-354
Check: CKV_AWS_17: "Ensure all data stored in RDS is not publicly accessible"
	PASSED for resource: aws_db_instance.main
	File: /rds.tf:66-100
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/public-policies/public-2
Check: CKV_AWS_388: "Ensure AWS Aurora PostgreSQL is not exposed to local file read vulnerability"
	PASSED for resource: aws_db_instance.main
	File: /rds.tf:66-100
Check: CKV_AWS_211: "Ensure RDS uses a modern CaCert"
	PASSED for resource: aws_db_instance.main
	File: /rds.tf:66-100
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/ensure-aws-rds-uses-a-modern-cacert
Check: CKV_AWS_133: "Ensure that RDS instances has backup policy"
	PASSED for resource: aws_db_instance.main
	File: /rds.tf:66-100
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/ensure-that-rds-instances-have-backup-policy
Check: CKV_AWS_23: "Ensure every security group and rule has a description"
	PASSED for resource: aws_security_group.alb
	File: /security_groups.tf:5-39
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/networking-31
Check: CKV_AWS_277: "Ensure no security groups allow ingress from 0.0.0.0:0 to port -1"
	PASSED for resource: aws_security_group.alb
	File: /security_groups.tf:5-39
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-aws-security-group-does-not-allow-all-traffic-on-all-ports
Check: CKV_AWS_24: "Ensure no security groups allow ingress from 0.0.0.0:0 to port 22"
	PASSED for resource: aws_security_group.alb
	File: /security_groups.tf:5-39
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/networking-1-port-security
Check: CKV_AWS_25: "Ensure no security groups allow ingress from 0.0.0.0:0 to port 3389"
	PASSED for resource: aws_security_group.alb
	File: /security_groups.tf:5-39
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/networking-2
Check: CKV_AWS_23: "Ensure every security group and rule has a description"
	PASSED for resource: aws_security_group.frontend
	File: /security_groups.tf:45-71
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/networking-31
Check: CKV_AWS_277: "Ensure no security groups allow ingress from 0.0.0.0:0 to port -1"
	PASSED for resource: aws_security_group.frontend
	File: /security_groups.tf:45-71
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-aws-security-group-does-not-allow-all-traffic-on-all-ports
Check: CKV_AWS_24: "Ensure no security groups allow ingress from 0.0.0.0:0 to port 22"
	PASSED for resource: aws_security_group.frontend
	File: /security_groups.tf:45-71
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/networking-1-port-security
Check: CKV_AWS_25: "Ensure no security groups allow ingress from 0.0.0.0:0 to port 3389"
	PASSED for resource: aws_security_group.frontend
	File: /security_groups.tf:45-71
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/networking-2
Check: CKV_AWS_260: "Ensure no security groups allow ingress from 0.0.0.0:0 to port 80"
	PASSED for resource: aws_security_group.frontend
	File: /security_groups.tf:45-71
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-aws-security-groups-do-not-allow-ingress-from-00000-to-port-80
Check: CKV_AWS_23: "Ensure every security group and rule has a description"
	PASSED for resource: aws_security_group.backend
	File: /security_groups.tf:77-103
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/networking-31
Check: CKV_AWS_277: "Ensure no security groups allow ingress from 0.0.0.0:0 to port -1"
	PASSED for resource: aws_security_group.backend
	File: /security_groups.tf:77-103
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-aws-security-group-does-not-allow-all-traffic-on-all-ports
Check: CKV_AWS_24: "Ensure no security groups allow ingress from 0.0.0.0:0 to port 22"
	PASSED for resource: aws_security_group.backend
	File: /security_groups.tf:77-103
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/networking-1-port-security
Check: CKV_AWS_25: "Ensure no security groups allow ingress from 0.0.0.0:0 to port 3389"
	PASSED for resource: aws_security_group.backend
	File: /security_groups.tf:77-103
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/networking-2
Check: CKV_AWS_260: "Ensure no security groups allow ingress from 0.0.0.0:0 to port 80"
	PASSED for resource: aws_security_group.backend
	File: /security_groups.tf:77-103
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-aws-security-groups-do-not-allow-ingress-from-00000-to-port-80
Check: CKV_AWS_23: "Ensure every security group and rule has a description"
	PASSED for resource: aws_security_group.rds
	File: /security_groups.tf:110-136
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/networking-31
Check: CKV_AWS_277: "Ensure no security groups allow ingress from 0.0.0.0:0 to port -1"
	PASSED for resource: aws_security_group.rds
	File: /security_groups.tf:110-136
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-aws-security-group-does-not-allow-all-traffic-on-all-ports
Check: CKV_AWS_24: "Ensure no security groups allow ingress from 0.0.0.0:0 to port 22"
	PASSED for resource: aws_security_group.rds
	File: /security_groups.tf:110-136
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/networking-1-port-security
Check: CKV_AWS_25: "Ensure no security groups allow ingress from 0.0.0.0:0 to port 3389"
	PASSED for resource: aws_security_group.rds
	File: /security_groups.tf:110-136
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/networking-2
Check: CKV_AWS_260: "Ensure no security groups allow ingress from 0.0.0.0:0 to port 80"
	PASSED for resource: aws_security_group.rds
	File: /security_groups.tf:110-136
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-aws-security-groups-do-not-allow-ingress-from-00000-to-port-80
Check: CKV_AWS_41: "Ensure no hard coded AWS access key and secret key exists in provider"
	PASSED for resource: aws.default
	File: /versions.tf:25-35
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/secrets-policies/bc-aws-secrets-5
Check: CKV_AWS_130: "Ensure VPC subnets do not assign public IP by default"
	PASSED for resource: aws_subnet.private[0]
	File: /vpc.tf:56-70
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-vpc-subnets-do-not-assign-public-ip-by-default
Check: CKV_AWS_130: "Ensure VPC subnets do not assign public IP by default"
	PASSED for resource: aws_subnet.private[1]
	File: /vpc.tf:56-70
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-vpc-subnets-do-not-assign-public-ip-by-default
Check: CKV2_AWS_44: "Ensure AWS route table with VPC peering does not contain routes overly permissive to all traffic"
	PASSED for resource: aws_route_table.public
	File: /vpc.tf:110-123
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-aws-route-table-with-vpc-peering-does-not-contain-routes-overly-permissive-to-all-traffic
Check: CKV2_AWS_44: "Ensure AWS route table with VPC peering does not contain routes overly permissive to all traffic"
	PASSED for resource: aws_route_table.private
	File: /vpc.tf:139-152
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-aws-route-table-with-vpc-peering-does-not-contain-routes-overly-permissive-to-all-traffic
Check: CKV2_AWS_5: "Ensure that Security Groups are attached to another resource"
	PASSED for resource: aws_security_group.alb
	File: /security_groups.tf:5-39
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-that-security-groups-are-attached-to-ec2-instances-or-elastic-network-interfaces-enis
Check: CKV2_AWS_5: "Ensure that Security Groups are attached to another resource"
	PASSED for resource: aws_security_group.backend
	File: /security_groups.tf:77-103
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-that-security-groups-are-attached-to-ec2-instances-or-elastic-network-interfaces-enis
Check: CKV2_AWS_5: "Ensure that Security Groups are attached to another resource"
	PASSED for resource: aws_security_group.frontend
	File: /security_groups.tf:45-71
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-that-security-groups-are-attached-to-ec2-instances-or-elastic-network-interfaces-enis
Check: CKV2_AWS_5: "Ensure that Security Groups are attached to another resource"
	PASSED for resource: aws_security_group.rds
	File: /security_groups.tf:110-136
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-that-security-groups-are-attached-to-ec2-instances-or-elastic-network-interfaces-enis
Check: CKV2_AWS_74: "Ensure AWS Load Balancers use strong ciphers"
	PASSED for resource: aws_lb_listener.http[0]
	File: /alb.tf:79-89
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/bc-aws-2-74
Check: CKV2_AWS_74: "Ensure AWS Load Balancers use strong ciphers"
	PASSED for resource: aws_lb_listener.https
	File: /alb.tf:132-147
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/bc-aws-2-74
Check: CKV2_AWS_69: "Ensure AWS RDS database instance configured with encryption in transit"
	PASSED for resource: aws_db_instance.main
	File: /rds.tf:66-100
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/bc-aws-2-69
Check: CKV2_AWS_56: "Ensure AWS Managed IAMFullAccess IAM policy is not used."
	PASSED for resource: aws_iam_role.ecs_task_execution
	File: /iam.tf:18-27
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-2-56
Check: CKV2_AWS_56: "Ensure AWS Managed IAMFullAccess IAM policy is not used."
	PASSED for resource: aws_iam_role_policy_attachment.ecs_task_execution
	File: /iam.tf:29-32
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-2-56
Check: CKV2_AWS_56: "Ensure AWS Managed IAMFullAccess IAM policy is not used."
	PASSED for resource: aws_iam_role.ecs_task
	File: /iam.tf:41-50
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-2-56
Check: CKV2_AWS_35: "AWS NAT Gateways should be utilized for the default route"
	PASSED for resource: aws_route_table.public
	File: /vpc.tf:110-123
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-aws-nat-gateways-are-utilized-for-the-default-route
Check: CKV2_AWS_35: "AWS NAT Gateways should be utilized for the default route"
	PASSED for resource: aws_route_table.private
	File: /vpc.tf:139-152
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-aws-nat-gateways-are-utilized-for-the-default-route
Check: CKV2_AWS_76: "Ensure AWS ALB attached WAFv2 WebACL is configured with AMR for Log4j Vulnerability"
	PASSED for resource: aws_lb.main
	File: /alb.tf:5-19
Check: CKV2_AWS_40: "Ensure AWS IAM policy does not allow full IAM privileges"
	PASSED for resource: aws_iam_policy_document.ecs_task_assume_role
	File: /iam.tf:6-16
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-2-40
Check: CKV2_AWS_40: "Ensure AWS IAM policy does not allow full IAM privileges"
	PASSED for resource: aws_iam_role_policy.ecs_execution_secrets
	File: /iam.tf:57-71
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/bc-aws-2-40
Check: CKV_AWS_103: "Ensure that load balancer is using at least TLS 1.2"
	PASSED for resource: aws_lb_listener.https
	File: /alb.tf:132-147
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-general-43
Check: CKV2_AWS_19: "Ensure that all EIP addresses allocated to a VPC are attached to EC2 instances"
	PASSED for resource: aws_eip.nat
	File: /vpc.tf:75-85
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-that-all-eip-addresses-allocated-to-a-vpc-are-attached-to-ec2-instances
Check: CKV2_AWS_23: "Route53 A Record has Attached Resource"
	PASSED for resource: aws_route53_record.alb[0]
	File: /dns.tf:35-46
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/ensure-route53-a-record-has-an-attached-resource
Check: CKV2_AWS_23: "Route53 A Record has Attached Resource"
	PASSED for resource: aws_route53_record.alb_www[0]
	File: /dns.tf:49-60
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/ensure-route53-a-record-has-an-attached-resource
Check: CKV_AWS_91: "Ensure the ELBv2 (Application/Network) has access logging enabled"
	FAILED for resource: aws_lb.main
	File: /alb.tf:5-19
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-logging-policies/bc-aws-logging-22

		5  | resource "aws_lb" "main" {
		6  |   name               = "${var.project_name}-alb"
		7  |   internal           = false
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

Check: CKV_AWS_150: "Ensure that Load Balancer has deletion protection enabled"
	FAILED for resource: aws_lb.main
	File: /alb.tf:5-19
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-150

		5  | resource "aws_lb" "main" {
		6  |   name               = "${var.project_name}-alb"
		7  |   internal           = false
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

Check: CKV_AWS_131: "Ensure that ALB drops HTTP headers"
	FAILED for resource: aws_lb.main
	File: /alb.tf:5-19
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-that-alb-drops-http-headers

		5  | resource "aws_lb" "main" {
		6  |   name               = "${var.project_name}-alb"
		7  |   internal           = false
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

Check: CKV_AWS_2: "Ensure ALB protocol is HTTPS"
	FAILED for resource: aws_lb_listener.http[0]
	File: /alb.tf:79-89
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/networking-29

		79 | resource "aws_lb_listener" "http" {
		80 |   count             = var.enable_https ? 0 : 1
		81 |   load_balancer_arn = aws_lb.main.arn
		82 |   port              = 80
		83 |   protocol          = "HTTP"
		84 | 
		85 |   default_action {
		86 |     type             = "forward"
		87 |     target_group_arn = aws_lb_target_group.frontend.arn
		88 |   }
		89 | }

Check: CKV_AWS_51: "Ensure ECR Image Tags are immutable"
	FAILED for resource: aws_ecr_repository.backend
	File: /ecr.tf:4-18
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-general-24

		4  | resource "aws_ecr_repository" "backend" {
		5  |   name                 = "${var.project_name}-backend"
		6  |   image_tag_mutability = "MUTABLE"
		7  |   force_delete         = true
		8  | 
		9  |   image_scanning_configuration {
		10 |     scan_on_push = true
		11 |   }
		12 | 
		13 |   tags = {
		14 |     Name        = "${var.project_name}-backend"
		15 |     Project     = var.project_name
		16 |     Environment = var.environment
		17 |   }
		18 | }

Check: CKV_AWS_136: "Ensure that ECR repositories are encrypted using KMS"
	FAILED for resource: aws_ecr_repository.backend
	File: /ecr.tf:4-18
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/ensure-that-ecr-repositories-are-encrypted

		4  | resource "aws_ecr_repository" "backend" {
		5  |   name                 = "${var.project_name}-backend"
		6  |   image_tag_mutability = "MUTABLE"
		7  |   force_delete         = true
		8  | 
		9  |   image_scanning_configuration {
		10 |     scan_on_push = true
		11 |   }
		12 | 
		13 |   tags = {
		14 |     Name        = "${var.project_name}-backend"
		15 |     Project     = var.project_name
		16 |     Environment = var.environment
		17 |   }
		18 | }

Check: CKV_AWS_51: "Ensure ECR Image Tags are immutable"
	FAILED for resource: aws_ecr_repository.frontend
	File: /ecr.tf:44-58
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-general-24

		44 | resource "aws_ecr_repository" "frontend" {
		45 |   name                 = "${var.project_name}-frontend"
		46 |   image_tag_mutability = "MUTABLE"
		47 |   force_delete         = true
		48 | 
		49 |   image_scanning_configuration {
		50 |     scan_on_push = true
		51 |   }
		52 | 
		53 |   tags = {
		54 |     Name        = "${var.project_name}-frontend"
		55 |     Project     = var.project_name
		56 |     Environment = var.environment
		57 |   }
		58 | }

Check: CKV_AWS_136: "Ensure that ECR repositories are encrypted using KMS"
	FAILED for resource: aws_ecr_repository.frontend
	File: /ecr.tf:44-58
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/ensure-that-ecr-repositories-are-encrypted

		44 | resource "aws_ecr_repository" "frontend" {
		45 |   name                 = "${var.project_name}-frontend"
		46 |   image_tag_mutability = "MUTABLE"
		47 |   force_delete         = true
		48 | 
		49 |   image_scanning_configuration {
		50 |     scan_on_push = true
		51 |   }
		52 | 
		53 |   tags = {
		54 |     Name        = "${var.project_name}-frontend"
		55 |     Project     = var.project_name
		56 |     Environment = var.environment
		57 |   }
		58 | }

Check: CKV_AWS_338: "Ensure CloudWatch log groups retains logs for at least 1 year"
	FAILED for resource: aws_cloudwatch_log_group.backend
	File: /ecs.tf:4-13
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-logging-policies/bc-aws-338

		4  | resource "aws_cloudwatch_log_group" "backend" {
		5  |   name              = "/ecs/${var.project_name}/backend"
		6  |   retention_in_days = 30
		7  | 
		8  |   tags = {
		9  |     Name        = "${var.project_name}-backend-logs"
		10 |     Project     = var.project_name
		11 |     Environment = var.environment
		12 |   }
		13 | }

Check: CKV_AWS_158: "Ensure that CloudWatch Log Group is encrypted by KMS"
	FAILED for resource: aws_cloudwatch_log_group.backend
	File: /ecs.tf:4-13
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/ensure-that-cloudwatch-log-group-is-encrypted-by-kms

		4  | resource "aws_cloudwatch_log_group" "backend" {
		5  |   name              = "/ecs/${var.project_name}/backend"
		6  |   retention_in_days = 30
		7  | 
		8  |   tags = {
		9  |     Name        = "${var.project_name}-backend-logs"
		10 |     Project     = var.project_name
		11 |     Environment = var.environment
		12 |   }
		13 | }

Check: CKV_AWS_338: "Ensure CloudWatch log groups retains logs for at least 1 year"
	FAILED for resource: aws_cloudwatch_log_group.frontend
	File: /ecs.tf:15-24
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-logging-policies/bc-aws-338

		15 | resource "aws_cloudwatch_log_group" "frontend" {
		16 |   name              = "/ecs/${var.project_name}/frontend"
		17 |   retention_in_days = 30
		18 | 
		19 |   tags = {
		20 |     Name        = "${var.project_name}-frontend-logs"
		21 |     Project     = var.project_name
		22 |     Environment = var.environment
		23 |   }
		24 | }

Check: CKV_AWS_158: "Ensure that CloudWatch Log Group is encrypted by KMS"
	FAILED for resource: aws_cloudwatch_log_group.frontend
	File: /ecs.tf:15-24
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/ensure-that-cloudwatch-log-group-is-encrypted-by-kms

		15 | resource "aws_cloudwatch_log_group" "frontend" {
		16 |   name              = "/ecs/${var.project_name}/frontend"
		17 |   retention_in_days = 30
		18 | 
		19 |   tags = {
		20 |     Name        = "${var.project_name}-frontend-logs"
		21 |     Project     = var.project_name
		22 |     Environment = var.environment
		23 |   }
		24 | }

Check: CKV_AWS_149: "Ensure that Secrets Manager secret is encrypted using KMS CMK"
	FAILED for resource: aws_secretsmanager_secret.db_url
	File: /rds.tf:18-28
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/ensure-that-secrets-manager-secret-is-encrypted-using-kms

		18 | resource "aws_secretsmanager_secret" "db_url" {
		19 |   name                    = "${var.project_name}/${var.environment}/database-url"
		20 |   description             = "PostgreSQL DATABASE_URL for the ${var.project_name} backend service"
		21 |   recovery_window_in_days = 7
		22 | 
		23 |   tags = {
		24 |     Name        = "${var.project_name}-db-url-secret"
		25 |     Project     = var.project_name
		26 |     Environment = var.environment
		27 |   }
		28 | }

Check: CKV_AWS_118: "Ensure that enhanced monitoring is enabled for Amazon RDS instances"
	FAILED for resource: aws_db_instance.main
	File: /rds.tf:66-100
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-logging-policies/ensure-that-enhanced-monitoring-is-enabled-for-amazon-rds-instances

		66  | resource "aws_db_instance" "main" {
		67  |   identifier        = "${var.project_name}-${var.environment}"
		68  |   engine            = "postgres"
		69  |   engine_version    = "16"
		70  |   instance_class    = var.db_instance_class
		71  |   allocated_storage = var.db_allocated_storage
		72  |   storage_type      = "gp3"
		73  |   storage_encrypted = true
		74  | 
		75  |   db_name  = var.db_name
		76  |   username = var.db_username
		77  |   password = random_password.db_password.result
		78  | 
		79  |   db_subnet_group_name   = aws_db_subnet_group.main.name
		80  |   vpc_security_group_ids = [aws_security_group.rds.id]
		81  | 
		82  |   multi_az            = var.db_multi_az
		83  |   publicly_accessible = false
		84  |   deletion_protection = var.db_deletion_protection
		85  | 
		86  |   # Take a final snapshot before deletion only when deletion_protection is on,
		87  |   # which signals a production-grade deployment.
		88  |   skip_final_snapshot       = !var.db_deletion_protection
		89  |   final_snapshot_identifier = var.db_deletion_protection ? "${var.project_name}-${var.environment}-final-snapshot" : null
		90  | 
		91  |   backup_retention_period = 7
		92  |   backup_window           = "03:00-04:00"
		93  |   maintenance_window      = "mon:04:00-mon:05:00"
		94  | 
		95  |   tags = {
		96  |     Name        = "${var.project_name}-db"
		97  |     Project     = var.project_name
		98  |     Environment = var.environment
		99  |   }
		100 | }

Check: CKV_AWS_353: "Ensure that RDS instances have performance insights enabled"
	FAILED for resource: aws_db_instance.main
	File: /rds.tf:66-100
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-logging-policies/bc-aws-353

		66  | resource "aws_db_instance" "main" {
		67  |   identifier        = "${var.project_name}-${var.environment}"
		68  |   engine            = "postgres"
		69  |   engine_version    = "16"
		70  |   instance_class    = var.db_instance_class
		71  |   allocated_storage = var.db_allocated_storage
		72  |   storage_type      = "gp3"
		73  |   storage_encrypted = true
		74  | 
		75  |   db_name  = var.db_name
		76  |   username = var.db_username
		77  |   password = random_password.db_password.result
		78  | 
		79  |   db_subnet_group_name   = aws_db_subnet_group.main.name
		80  |   vpc_security_group_ids = [aws_security_group.rds.id]
		81  | 
		82  |   multi_az            = var.db_multi_az
		83  |   publicly_accessible = false
		84  |   deletion_protection = var.db_deletion_protection
		85  | 
		86  |   # Take a final snapshot before deletion only when deletion_protection is on,
		87  |   # which signals a production-grade deployment.
		88  |   skip_final_snapshot       = !var.db_deletion_protection
		89  |   final_snapshot_identifier = var.db_deletion_protection ? "${var.project_name}-${var.environment}-final-snapshot" : null
		90  | 
		91  |   backup_retention_period = 7
		92  |   backup_window           = "03:00-04:00"
		93  |   maintenance_window      = "mon:04:00-mon:05:00"
		94  | 
		95  |   tags = {
		96  |     Name        = "${var.project_name}-db"
		97  |     Project     = var.project_name
		98  |     Environment = var.environment
		99  |   }
		100 | }

Check: CKV_AWS_226: "Ensure DB instance gets all minor upgrades automatically"
	FAILED for resource: aws_db_instance.main
	File: /rds.tf:66-100
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/ensure-aws-db-instance-gets-all-minor-upgrades-automatically

		66  | resource "aws_db_instance" "main" {
		67  |   identifier        = "${var.project_name}-${var.environment}"
		68  |   engine            = "postgres"
		69  |   engine_version    = "16"
		70  |   instance_class    = var.db_instance_class
		71  |   allocated_storage = var.db_allocated_storage
		72  |   storage_type      = "gp3"
		73  |   storage_encrypted = true
		74  | 
		75  |   db_name  = var.db_name
		76  |   username = var.db_username
		77  |   password = random_password.db_password.result
		78  | 
		79  |   db_subnet_group_name   = aws_db_subnet_group.main.name
		80  |   vpc_security_group_ids = [aws_security_group.rds.id]
		81  | 
		82  |   multi_az            = var.db_multi_az
		83  |   publicly_accessible = false
		84  |   deletion_protection = var.db_deletion_protection
		85  | 
		86  |   # Take a final snapshot before deletion only when deletion_protection is on,
		87  |   # which signals a production-grade deployment.
		88  |   skip_final_snapshot       = !var.db_deletion_protection
		89  |   final_snapshot_identifier = var.db_deletion_protection ? "${var.project_name}-${var.environment}-final-snapshot" : null
		90  | 
		91  |   backup_retention_period = 7
		92  |   backup_window           = "03:00-04:00"
		93  |   maintenance_window      = "mon:04:00-mon:05:00"
		94  | 
		95  |   tags = {
		96  |     Name        = "${var.project_name}-db"
		97  |     Project     = var.project_name
		98  |     Environment = var.environment
		99  |   }
		100 | }

Check: CKV_AWS_161: "Ensure RDS database has IAM authentication enabled"
	FAILED for resource: aws_db_instance.main
	File: /rds.tf:66-100
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/ensure-rds-database-has-iam-authentication-enabled

		66  | resource "aws_db_instance" "main" {
		67  |   identifier        = "${var.project_name}-${var.environment}"
		68  |   engine            = "postgres"
		69  |   engine_version    = "16"
		70  |   instance_class    = var.db_instance_class
		71  |   allocated_storage = var.db_allocated_storage
		72  |   storage_type      = "gp3"
		73  |   storage_encrypted = true
		74  | 
		75  |   db_name  = var.db_name
		76  |   username = var.db_username
		77  |   password = random_password.db_password.result
		78  | 
		79  |   db_subnet_group_name   = aws_db_subnet_group.main.name
		80  |   vpc_security_group_ids = [aws_security_group.rds.id]
		81  | 
		82  |   multi_az            = var.db_multi_az
		83  |   publicly_accessible = false
		84  |   deletion_protection = var.db_deletion_protection
		85  | 
		86  |   # Take a final snapshot before deletion only when deletion_protection is on,
		87  |   # which signals a production-grade deployment.
		88  |   skip_final_snapshot       = !var.db_deletion_protection
		89  |   final_snapshot_identifier = var.db_deletion_protection ? "${var.project_name}-${var.environment}-final-snapshot" : null
		90  | 
		91  |   backup_retention_period = 7
		92  |   backup_window           = "03:00-04:00"
		93  |   maintenance_window      = "mon:04:00-mon:05:00"
		94  | 
		95  |   tags = {
		96  |     Name        = "${var.project_name}-db"
		97  |     Project     = var.project_name
		98  |     Environment = var.environment
		99  |   }
		100 | }

Check: CKV_AWS_157: "Ensure that RDS instances have Multi-AZ enabled"
	FAILED for resource: aws_db_instance.main
	File: /rds.tf:66-100
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/general-73

		66  | resource "aws_db_instance" "main" {
		67  |   identifier        = "${var.project_name}-${var.environment}"
		68  |   engine            = "postgres"
		69  |   engine_version    = "16"
		70  |   instance_class    = var.db_instance_class
		71  |   allocated_storage = var.db_allocated_storage
		72  |   storage_type      = "gp3"
		73  |   storage_encrypted = true
		74  | 
		75  |   db_name  = var.db_name
		76  |   username = var.db_username
		77  |   password = random_password.db_password.result
		78  | 
		79  |   db_subnet_group_name   = aws_db_subnet_group.main.name
		80  |   vpc_security_group_ids = [aws_security_group.rds.id]
		81  | 
		82  |   multi_az            = var.db_multi_az
		83  |   publicly_accessible = false
		84  |   deletion_protection = var.db_deletion_protection
		85  | 
		86  |   # Take a final snapshot before deletion only when deletion_protection is on,
		87  |   # which signals a production-grade deployment.
		88  |   skip_final_snapshot       = !var.db_deletion_protection
		89  |   final_snapshot_identifier = var.db_deletion_protection ? "${var.project_name}-${var.environment}-final-snapshot" : null
		90  | 
		91  |   backup_retention_period = 7
		92  |   backup_window           = "03:00-04:00"
		93  |   maintenance_window      = "mon:04:00-mon:05:00"
		94  | 
		95  |   tags = {
		96  |     Name        = "${var.project_name}-db"
		97  |     Project     = var.project_name
		98  |     Environment = var.environment
		99  |   }
		100 | }

Check: CKV_AWS_293: "Ensure that AWS database instances have deletion protection enabled"
	FAILED for resource: aws_db_instance.main
	File: /rds.tf:66-100
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-293

		66  | resource "aws_db_instance" "main" {
		67  |   identifier        = "${var.project_name}-${var.environment}"
		68  |   engine            = "postgres"
		69  |   engine_version    = "16"
		70  |   instance_class    = var.db_instance_class
		71  |   allocated_storage = var.db_allocated_storage
		72  |   storage_type      = "gp3"
		73  |   storage_encrypted = true
		74  | 
		75  |   db_name  = var.db_name
		76  |   username = var.db_username
		77  |   password = random_password.db_password.result
		78  | 
		79  |   db_subnet_group_name   = aws_db_subnet_group.main.name
		80  |   vpc_security_group_ids = [aws_security_group.rds.id]
		81  | 
		82  |   multi_az            = var.db_multi_az
		83  |   publicly_accessible = false
		84  |   deletion_protection = var.db_deletion_protection
		85  | 
		86  |   # Take a final snapshot before deletion only when deletion_protection is on,
		87  |   # which signals a production-grade deployment.
		88  |   skip_final_snapshot       = !var.db_deletion_protection
		89  |   final_snapshot_identifier = var.db_deletion_protection ? "${var.project_name}-${var.environment}-final-snapshot" : null
		90  | 
		91  |   backup_retention_period = 7
		92  |   backup_window           = "03:00-04:00"
		93  |   maintenance_window      = "mon:04:00-mon:05:00"
		94  | 
		95  |   tags = {
		96  |     Name        = "${var.project_name}-db"
		97  |     Project     = var.project_name
		98  |     Environment = var.environment
		99  |   }
		100 | }

Check: CKV_AWS_129: "Ensure that respective logs of Amazon Relational Database Service (Amazon RDS) are enabled"
	FAILED for resource: aws_db_instance.main
	File: /rds.tf:66-100
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies/ensure-that-respective-logs-of-amazon-relational-database-service-amazon-rds-are-enabled

		66  | resource "aws_db_instance" "main" {
		67  |   identifier        = "${var.project_name}-${var.environment}"
		68  |   engine            = "postgres"
		69  |   engine_version    = "16"
		70  |   instance_class    = var.db_instance_class
		71  |   allocated_storage = var.db_allocated_storage
		72  |   storage_type      = "gp3"
		73  |   storage_encrypted = true
		74  | 
		75  |   db_name  = var.db_name
		76  |   username = var.db_username
		77  |   password = random_password.db_password.result
		78  | 
		79  |   db_subnet_group_name   = aws_db_subnet_group.main.name
		80  |   vpc_security_group_ids = [aws_security_group.rds.id]
		81  | 
		82  |   multi_az            = var.db_multi_az
		83  |   publicly_accessible = false
		84  |   deletion_protection = var.db_deletion_protection
		85  | 
		86  |   # Take a final snapshot before deletion only when deletion_protection is on,
		87  |   # which signals a production-grade deployment.
		88  |   skip_final_snapshot       = !var.db_deletion_protection
		89  |   final_snapshot_identifier = var.db_deletion_protection ? "${var.project_name}-${var.environment}-final-snapshot" : null
		90  | 
		91  |   backup_retention_period = 7
		92  |   backup_window           = "03:00-04:00"
		93  |   maintenance_window      = "mon:04:00-mon:05:00"
		94  | 
		95  |   tags = {
		96  |     Name        = "${var.project_name}-db"
		97  |     Project     = var.project_name
		98  |     Environment = var.environment
		99  |   }
		100 | }

Check: CKV_AWS_382: "Ensure no security groups allow egress from 0.0.0.0:0 to port -1"
	FAILED for resource: aws_security_group.alb
	File: /security_groups.tf:5-39
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/bc-aws-382

		5  | resource "aws_security_group" "alb" {
		6  |   name        = "${var.project_name}-alb-sg"
		7  |   description = "Allow inbound HTTP/HTTPS from the internet"
		8  |   vpc_id      = aws_vpc.main.id
		9  | 
		10 |   ingress {
		11 |     description = "HTTP"
		12 |     from_port   = 80
		13 |     to_port     = 80
		14 |     protocol    = "tcp"
		15 |     cidr_blocks = ["0.0.0.0/0"]
		16 |   }
		17 | 
		18 |   ingress {
		19 |     description = "HTTPS"
		20 |     from_port   = 443
		21 |     to_port     = 443
		22 |     protocol    = "tcp"
		23 |     cidr_blocks = ["0.0.0.0/0"]
		24 |   }
		25 | 
		26 |   egress {
		27 |     description = "Allow all outbound"
		28 |     from_port   = 0
		29 |     to_port     = 0
		30 |     protocol    = "-1"
		31 |     cidr_blocks = ["0.0.0.0/0"]
		32 |   }
		33 | 
		34 |   tags = {
		35 |     Name        = "${var.project_name}-alb-sg"
		36 |     Project     = var.project_name
		37 |     Environment = var.environment
		38 |   }
		39 | }

Check: CKV_AWS_260: "Ensure no security groups allow ingress from 0.0.0.0:0 to port 80"
	FAILED for resource: aws_security_group.alb
	File: /security_groups.tf:5-39
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-aws-security-groups-do-not-allow-ingress-from-00000-to-port-80

		5  | resource "aws_security_group" "alb" {
		6  |   name        = "${var.project_name}-alb-sg"
		7  |   description = "Allow inbound HTTP/HTTPS from the internet"
		8  |   vpc_id      = aws_vpc.main.id
		9  | 
		10 |   ingress {
		11 |     description = "HTTP"
		12 |     from_port   = 80
		13 |     to_port     = 80
		14 |     protocol    = "tcp"
		15 |     cidr_blocks = ["0.0.0.0/0"]
		16 |   }
		17 | 
		18 |   ingress {
		19 |     description = "HTTPS"
		20 |     from_port   = 443
		21 |     to_port     = 443
		22 |     protocol    = "tcp"
		23 |     cidr_blocks = ["0.0.0.0/0"]
		24 |   }
		25 | 
		26 |   egress {
		27 |     description = "Allow all outbound"
		28 |     from_port   = 0
		29 |     to_port     = 0
		30 |     protocol    = "-1"
		31 |     cidr_blocks = ["0.0.0.0/0"]
		32 |   }
		33 | 
		34 |   tags = {
		35 |     Name        = "${var.project_name}-alb-sg"
		36 |     Project     = var.project_name
		37 |     Environment = var.environment
		38 |   }
		39 | }

Check: CKV_AWS_382: "Ensure no security groups allow egress from 0.0.0.0:0 to port -1"
	FAILED for resource: aws_security_group.frontend
	File: /security_groups.tf:45-71
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/bc-aws-382

		45 | resource "aws_security_group" "frontend" {
		46 |   name        = "${var.project_name}-frontend-sg"
		47 |   description = "Allow inbound traffic from ALB to frontend"
		48 |   vpc_id      = aws_vpc.main.id
		49 | 
		50 |   ingress {
		51 |     description     = "From ALB"
		52 |     from_port       = var.frontend_port
		53 |     to_port         = var.frontend_port
		54 |     protocol        = "tcp"
		55 |     security_groups = [aws_security_group.alb.id]
		56 |   }
		57 | 
		58 |   egress {
		59 |     description = "Allow all outbound"
		60 |     from_port   = 0
		61 |     to_port     = 0
		62 |     protocol    = "-1"
		63 |     cidr_blocks = ["0.0.0.0/0"]
		64 |   }
		65 | 
		66 |   tags = {
		67 |     Name        = "${var.project_name}-frontend-sg"
		68 |     Project     = var.project_name
		69 |     Environment = var.environment
		70 |   }
		71 | }

Check: CKV_AWS_382: "Ensure no security groups allow egress from 0.0.0.0:0 to port -1"
	FAILED for resource: aws_security_group.backend
	File: /security_groups.tf:77-103
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/bc-aws-382

		77  | resource "aws_security_group" "backend" {
		78  |   name        = "${var.project_name}-backend-sg"
		79  |   description = "Allow inbound traffic from ALB to backend"
		80  |   vpc_id      = aws_vpc.main.id
		81  | 
		82  |   ingress {
		83  |     description     = "From ALB"
		84  |     from_port       = var.backend_port
		85  |     to_port         = var.backend_port
		86  |     protocol        = "tcp"
		87  |     security_groups = [aws_security_group.alb.id]
		88  |   }
		89  | 
		90  |   egress {
		91  |     description = "Allow all outbound"
		92  |     from_port   = 0
		93  |     to_port     = 0
		94  |     protocol    = "-1"
		95  |     cidr_blocks = ["0.0.0.0/0"]
		96  |   }
		97  | 
		98  |   tags = {
		99  |     Name        = "${var.project_name}-backend-sg"
		100 |     Project     = var.project_name
		101 |     Environment = var.environment
		102 |   }
		103 | }

Check: CKV_AWS_382: "Ensure no security groups allow egress from 0.0.0.0:0 to port -1"
	FAILED for resource: aws_security_group.rds
	File: /security_groups.tf:110-136
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/bc-aws-382

		110 | resource "aws_security_group" "rds" {
		111 |   name        = "${var.project_name}-rds-sg"
		112 |   description = "Allow inbound PostgreSQL from backend ECS tasks only"
		113 |   vpc_id      = aws_vpc.main.id
		114 | 
		115 |   ingress {
		116 |     description     = "PostgreSQL from backend"
		117 |     from_port       = 5432
		118 |     to_port         = 5432
		119 |     protocol        = "tcp"
		120 |     security_groups = [aws_security_group.backend.id]
		121 |   }
		122 | 
		123 |   egress {
		124 |     description = "Allow all outbound"
		125 |     from_port   = 0
		126 |     to_port     = 0
		127 |     protocol    = "-1"
		128 |     cidr_blocks = ["0.0.0.0/0"]
		129 |   }
		130 | 
		131 |   tags = {
		132 |     Name        = "${var.project_name}-rds-sg"
		133 |     Project     = var.project_name
		134 |     Environment = var.environment
		135 |   }
		136 | }

Check: CKV_AWS_130: "Ensure VPC subnets do not assign public IP by default"
	FAILED for resource: aws_subnet.public[0]
	File: /vpc.tf:34-48
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-vpc-subnets-do-not-assign-public-ip-by-default

		34 | resource "aws_subnet" "public" {
		35 |   count = length(var.public_subnet_cidrs)
		36 | 
		37 |   vpc_id                  = aws_vpc.main.id
		38 |   cidr_block              = var.public_subnet_cidrs[count.index]
		39 |   availability_zone       = var.availability_zones[count.index]
		40 |   map_public_ip_on_launch = true
		41 | 
		42 |   tags = {
		43 |     Name        = "${var.project_name}-public-subnet-${count.index + 1}"
		44 |     Tier        = "Public"
		45 |     Project     = var.project_name
		46 |     Environment = var.environment
		47 |   }
		48 | }

Check: CKV_AWS_130: "Ensure VPC subnets do not assign public IP by default"
	FAILED for resource: aws_subnet.public[1]
	File: /vpc.tf:34-48
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-vpc-subnets-do-not-assign-public-ip-by-default

		34 | resource "aws_subnet" "public" {
		35 |   count = length(var.public_subnet_cidrs)
		36 | 
		37 |   vpc_id                  = aws_vpc.main.id
		38 |   cidr_block              = var.public_subnet_cidrs[count.index]
		39 |   availability_zone       = var.availability_zones[count.index]
		40 |   map_public_ip_on_launch = true
		41 | 
		42 |   tags = {
		43 |     Name        = "${var.project_name}-public-subnet-${count.index + 1}"
		44 |     Tier        = "Public"
		45 |     Project     = var.project_name
		46 |     Environment = var.environment
		47 |   }
		48 | }

Check: CKV2_AWS_30: "Ensure Postgres RDS as aws_db_instance has Query Logging enabled"
	FAILED for resource: aws_db_instance.main
	File: /rds.tf:66-100
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/ensure-postgres-rds-has-query-logging-enabled

		66  | resource "aws_db_instance" "main" {
		67  |   identifier        = "${var.project_name}-${var.environment}"
		68  |   engine            = "postgres"
		69  |   engine_version    = "16"
		70  |   instance_class    = var.db_instance_class
		71  |   allocated_storage = var.db_allocated_storage
		72  |   storage_type      = "gp3"
		73  |   storage_encrypted = true
		74  | 
		75  |   db_name  = var.db_name
		76  |   username = var.db_username
		77  |   password = random_password.db_password.result
		78  | 
		79  |   db_subnet_group_name   = aws_db_subnet_group.main.name
		80  |   vpc_security_group_ids = [aws_security_group.rds.id]
		81  | 
		82  |   multi_az            = var.db_multi_az
		83  |   publicly_accessible = false
		84  |   deletion_protection = var.db_deletion_protection
		85  | 
		86  |   # Take a final snapshot before deletion only when deletion_protection is on,
		87  |   # which signals a production-grade deployment.
		88  |   skip_final_snapshot       = !var.db_deletion_protection
		89  |   final_snapshot_identifier = var.db_deletion_protection ? "${var.project_name}-${var.environment}-final-snapshot" : null
		90  | 
		91  |   backup_retention_period = 7
		92  |   backup_window           = "03:00-04:00"
		93  |   maintenance_window      = "mon:04:00-mon:05:00"
		94  | 
		95  |   tags = {
		96  |     Name        = "${var.project_name}-db"
		97  |     Project     = var.project_name
		98  |     Environment = var.environment
		99  |   }
		100 | }

Check: CKV2_AWS_20: "Ensure that ALB redirects HTTP requests into HTTPS ones"
	FAILED for resource: aws_lb.main
	File: /alb.tf:5-19
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-that-alb-redirects-http-requests-into-https-ones

		5  | resource "aws_lb" "main" {
		6  |   name               = "${var.project_name}-alb"
		7  |   internal           = false
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

Check: CKV2_AWS_38: "Ensure Domain Name System Security Extensions (DNSSEC) signing is enabled for Amazon Route 53 public hosted zones"
	FAILED for resource: aws_route53_zone.main[0]
	File: /dns.tf:23-32
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/bc-aws-2-38

		23 | resource "aws_route53_zone" "main" {
		24 |   count = var.create_route53_zone && var.domain_name != "" && var.route53_zone_id == "" ? 1 : 0
		25 |   name  = var.domain_name
		26 | 
		27 |   tags = {
		28 |     Name        = "${var.project_name}-zone"
		29 |     Project     = var.project_name
		30 |     Environment = var.environment
		31 |   }
		32 | }

Check: CKV2_AWS_60: "Ensure RDS instance with copy tags to snapshots is enabled"
	FAILED for resource: aws_db_instance.main
	File: /rds.tf:66-100
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-2-60

		66  | resource "aws_db_instance" "main" {
		67  |   identifier        = "${var.project_name}-${var.environment}"
		68  |   engine            = "postgres"
		69  |   engine_version    = "16"
		70  |   instance_class    = var.db_instance_class
		71  |   allocated_storage = var.db_allocated_storage
		72  |   storage_type      = "gp3"
		73  |   storage_encrypted = true
		74  | 
		75  |   db_name  = var.db_name
		76  |   username = var.db_username
		77  |   password = random_password.db_password.result
		78  | 
		79  |   db_subnet_group_name   = aws_db_subnet_group.main.name
		80  |   vpc_security_group_ids = [aws_security_group.rds.id]
		81  | 
		82  |   multi_az            = var.db_multi_az
		83  |   publicly_accessible = false
		84  |   deletion_protection = var.db_deletion_protection
		85  | 
		86  |   # Take a final snapshot before deletion only when deletion_protection is on,
		87  |   # which signals a production-grade deployment.
		88  |   skip_final_snapshot       = !var.db_deletion_protection
		89  |   final_snapshot_identifier = var.db_deletion_protection ? "${var.project_name}-${var.environment}-final-snapshot" : null
		90  | 
		91  |   backup_retention_period = 7
		92  |   backup_window           = "03:00-04:00"
		93  |   maintenance_window      = "mon:04:00-mon:05:00"
		94  | 
		95  |   tags = {
		96  |     Name        = "${var.project_name}-db"
		97  |     Project     = var.project_name
		98  |     Environment = var.environment
		99  |   }
		100 | }

Check: CKV2_AWS_57: "Ensure Secrets Manager secrets should have automatic rotation enabled"
	FAILED for resource: aws_secretsmanager_secret.db_url
	File: /rds.tf:18-28
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-2-57

		18 | resource "aws_secretsmanager_secret" "db_url" {
		19 |   name                    = "${var.project_name}/${var.environment}/database-url"
		20 |   description             = "PostgreSQL DATABASE_URL for the ${var.project_name} backend service"
		21 |   recovery_window_in_days = 7
		22 | 
		23 |   tags = {
		24 |     Name        = "${var.project_name}-db-url-secret"
		25 |     Project     = var.project_name
		26 |     Environment = var.environment
		27 |   }
		28 | }

Check: CKV2_AWS_28: "Ensure public facing ALB are protected by WAF"
	FAILED for resource: aws_lb.main
	File: /alb.tf:5-19
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/ensure-public-facing-alb-are-protected-by-waf

		5  | resource "aws_lb" "main" {
		6  |   name               = "${var.project_name}-alb"
		7  |   internal           = false
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

Check: CKV2_AWS_11: "Ensure VPC flow logging is enabled in all VPCs"
	FAILED for resource: aws_vpc.main
	File: /vpc.tf:4-14
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-logging-policies/logging-9-enable-vpc-flow-logging

		4  | resource "aws_vpc" "main" {
		5  |   cidr_block           = var.vpc_cidr
		6  |   enable_dns_support   = true
		7  |   enable_dns_hostnames = true
		8  | 
		9  |   tags = {
		10 |     Name        = "${var.project_name}-vpc"
		11 |     Project     = var.project_name
		12 |     Environment = var.environment
		13 |   }
		14 | }

Check: CKV2_AWS_12: "Ensure the default security group of every VPC restricts all traffic"
	FAILED for resource: aws_vpc.main
	File: /vpc.tf:4-14
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/networking-4

		4  | resource "aws_vpc" "main" {
		5  |   cidr_block           = var.vpc_cidr
		6  |   enable_dns_support   = true
		7  |   enable_dns_hostnames = true
		8  | 
		9  |   tags = {
		10 |     Name        = "${var.project_name}-vpc"
		11 |     Project     = var.project_name
		12 |     Environment = var.environment
		13 |   }
		14 | }

Check: CKV2_AWS_39: "Ensure Domain Name System (DNS) query logging is enabled for Amazon Route 53 hosted zones"
	FAILED for resource: aws_route53_zone.main[0]
	File: /dns.tf:23-32
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-logging-policies/bc-aws-2-39

		23 | resource "aws_route53_zone" "main" {
		24 |   count = var.create_route53_zone && var.domain_name != "" && var.route53_zone_id == "" ? 1 : 0
		25 |   name  = var.domain_name
		26 | 
		27 |   tags = {
		28 |     Name        = "${var.project_name}-zone"
		29 |     Project     = var.project_name
		30 |     Environment = var.environment
		31 |   }
		32 | }

Check: CKV_AWS_103: "Ensure that load balancer is using at least TLS 1.2"
	FAILED for resource: aws_lb_listener.http[0]
	File: /alb.tf:79-89
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-general-policies/bc-aws-general-43

		79 | resource "aws_lb_listener" "http" {
		80 |   count             = var.enable_https ? 0 : 1
		81 |   load_balancer_arn = aws_lb.main.arn
		82 |   port              = 80
		83 |   protocol          = "HTTP"
		84 | 
		85 |   default_action {
		86 |     type             = "forward"
		87 |     target_group_arn = aws_lb_target_group.frontend.arn
		88 |   }
		89 | }

Check: CKV_AWS_378: "Ensure AWS Load Balancer doesn't use HTTP protocol"
	FAILED for resource: aws_lb_target_group.frontend
	File: /alb.tf:24-48
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/bc-aws-378

		24 | resource "aws_lb_target_group" "frontend" {
		25 |   name        = "${var.project_name}-frontend-tg"
		26 |   port        = var.frontend_port
		27 |   protocol    = "HTTP"
		28 |   vpc_id      = aws_vpc.main.id
		29 |   target_type = "ip"
		30 | 
		31 |   health_check {
		32 |     enabled             = true
		33 |     path                = "/"
		34 |     port                = "traffic-port"
		35 |     protocol            = "HTTP"
		36 |     healthy_threshold   = 3
		37 |     unhealthy_threshold = 3
		38 |     timeout             = 5
		39 |     interval            = 30
		40 |     matcher             = "200-399"
		41 |   }
		42 | 
		43 |   tags = {
		44 |     Name        = "${var.project_name}-frontend-tg"
		45 |     Project     = var.project_name
		46 |     Environment = var.environment
		47 |   }
		48 | }

Check: CKV_AWS_378: "Ensure AWS Load Balancer doesn't use HTTP protocol"
	FAILED for resource: aws_lb_target_group.backend
	File: /alb.tf:50-74
	Guide: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/bc-aws-378

		50 | resource "aws_lb_target_group" "backend" {
		51 |   name        = "${var.project_name}-backend-tg"
		52 |   port        = var.backend_port
		53 |   protocol    = "HTTP"
		54 |   vpc_id      = aws_vpc.main.id
		55 |   target_type = "ip"
		56 | 
		57 |   health_check {
		58 |     enabled             = true
		59 |     path                = "/api/health"
		60 |     port                = "traffic-port"
		61 |     protocol            = "HTTP"
		62 |     healthy_threshold   = 3
		63 |     unhealthy_threshold = 3
		64 |     timeout             = 5
		65 |     interval            = 30
		66 |     matcher             = "200"
		67 |   }
		68 | 
		69 |   tags = {
		70 |     Name        = "${var.project_name}-backend-tg"
		71 |     Project     = var.project_name
		72 |     Environment = var.environment
		73 |   }
		74 | }


Error: Process completed with exit code 1.