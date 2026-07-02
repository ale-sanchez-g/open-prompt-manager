# Tests for VPC endpoints used to keep AWS API traffic inside the VPC.
# Uses mock_provider so no AWS credentials are required in CI.

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }
}

variables {
  project_name = "opm-test"
  environment  = "test"
  aws_region   = "us-east-1"
  vpc_cidr     = "10.0.0.0/16"
}

run "interface_endpoints_cover_required_services" {
  command = plan

  assert {
    condition = alltrue([
      for s in ["ecr.api", "ecr.dkr", "logs", "secretsmanager", "sts", "kms"] :
      contains(keys(aws_vpc_endpoint.interface), s)
    ])
    error_message = "Interface endpoints must be created for ECR (api/dkr), logs, secretsmanager, sts, and kms."
  }
}

run "interface_endpoints_use_private_dns" {
  command = plan

  assert {
    condition     = alltrue([for e in aws_vpc_endpoint.interface : e.private_dns_enabled == true])
    error_message = "Interface endpoints must enable private DNS so AWS service hostnames resolve in-VPC."
  }
}

run "interface_endpoints_are_interface_type" {
  command = plan

  assert {
    condition     = alltrue([for e in aws_vpc_endpoint.interface : e.vpc_endpoint_type == "Interface"])
    error_message = "Interface endpoints must use the 'Interface' endpoint type."
  }
}

run "s3_endpoint_is_gateway_type" {
  command = plan

  assert {
    condition     = aws_vpc_endpoint.s3.vpc_endpoint_type == "Gateway"
    error_message = "S3 endpoint must be a Gateway endpoint attached to the private route table."
  }
}

run "vpce_security_group_allows_https_from_vpc_only" {
  command = plan

  assert {
    condition = anytrue([
      for r in aws_security_group.vpc_endpoints.ingress :
      r.from_port == 443 && r.to_port == 443 && contains(r.cidr_blocks, var.vpc_cidr)
    ])
    error_message = "VPC endpoint security group must allow HTTPS (443) from the VPC CIDR."
  }

  assert {
    condition = alltrue([
      for r in aws_security_group.vpc_endpoints.ingress : !contains(r.cidr_blocks, "0.0.0.0/0")
    ])
    error_message = "VPC endpoint security group must not allow ingress from 0.0.0.0/0."
  }
}

run "vpce_security_group_has_required_tags" {
  command = plan

  assert {
    condition     = aws_security_group.vpc_endpoints.tags["Project"] == var.project_name
    error_message = "VPC endpoint security group must have a 'Project' tag."
  }

  assert {
    condition     = aws_security_group.vpc_endpoints.tags["Environment"] == var.environment
    error_message = "VPC endpoint security group must have an 'Environment' tag."
  }
}
