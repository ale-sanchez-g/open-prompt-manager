# Tests for VPC networking: VPC, subnets, IGW, NAT Gateway, route tables.
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

  vpc_cidr             = "10.0.0.0/16"
  public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.11.0/24"]
  availability_zones   = ["us-east-1a", "us-east-1b"]
}

# ─────────────────────────────────────────────
# VPC
# ─────────────────────────────────────────────
run "vpc_cidr_matches_variable" {
  command = plan

  assert {
    condition     = aws_vpc.main.cidr_block == var.vpc_cidr
    error_message = "VPC CIDR block must match var.vpc_cidr (${var.vpc_cidr})."
  }
}

run "vpc_dns_enabled" {
  command = plan

  assert {
    condition     = aws_vpc.main.enable_dns_support == true
    error_message = "VPC must have DNS support enabled."
  }

  assert {
    condition     = aws_vpc.main.enable_dns_hostnames == true
    error_message = "VPC must have DNS hostnames enabled."
  }
}

run "vpc_has_required_tags" {
  command = plan

  assert {
    condition     = aws_vpc.main.tags["project"] == var.project_name
    error_message = "VPC must have a 'project' tag matching var.project_name."
  }

  assert {
    condition     = aws_vpc.main.tags["environment"] == var.environment
    error_message = "VPC must have an 'environment' tag matching var.environment."
  }
}

# ─────────────────────────────────────────────
# Subnets
# ─────────────────────────────────────────────
run "public_subnet_count_matches_cidrs" {
  command = plan

  assert {
    condition     = length(aws_subnet.public) == length(var.public_subnet_cidrs)
    error_message = "Number of public subnets must match the number of public CIDR blocks."
  }
}

run "private_subnet_count_matches_cidrs" {
  command = plan

  assert {
    condition     = length(aws_subnet.private) == length(var.private_subnet_cidrs)
    error_message = "Number of private subnets must match the number of private CIDR blocks."
  }
}

run "public_subnets_auto_assign_public_ip" {
  command = plan

  assert {
    condition     = alltrue([for s in aws_subnet.public : s.map_public_ip_on_launch == true])
    error_message = "All public subnets must auto-assign public IPs."
  }
}

run "private_subnets_do_not_auto_assign_public_ip" {
  command = plan

  assert {
    condition     = alltrue([for s in aws_subnet.private : s.map_public_ip_on_launch == false])
    error_message = "Private subnets must not auto-assign public IPs."
  }
}

run "public_subnets_have_tier_tag" {
  command = plan

  assert {
    condition     = alltrue([for s in aws_subnet.public : s.tags["Tier"] == "Public"])
    error_message = "All public subnets must have Tier=Public tag."
  }
}

run "private_subnets_have_tier_tag" {
  command = plan

  assert {
    condition     = alltrue([for s in aws_subnet.private : s.tags["Tier"] == "Private"])
    error_message = "All private subnets must have Tier=Private tag."
  }
}

run "subnets_have_required_tags" {
  command = plan

  assert {
    condition     = alltrue([for s in aws_subnet.public : s.tags["project"] == var.project_name])
    error_message = "Public subnets must have 'project' tag."
  }

  assert {
    condition     = alltrue([for s in aws_subnet.public : s.tags["environment"] == var.environment])
    error_message = "Public subnets must have 'environment' tag."
  }

  assert {
    condition     = alltrue([for s in aws_subnet.private : s.tags["project"] == var.project_name])
    error_message = "Private subnets must have 'project' tag."
  }

  assert {
    condition     = alltrue([for s in aws_subnet.private : s.tags["environment"] == var.environment])
    error_message = "Private subnets must have 'environment' tag."
  }
}

# ─────────────────────────────────────────────
# Internet Gateway
# ─────────────────────────────────────────────
run "igw_has_required_tags" {
  command = plan

  assert {
    condition     = aws_internet_gateway.main.tags["project"] == var.project_name
    error_message = "Internet Gateway must have 'project' tag."
  }

  assert {
    condition     = aws_internet_gateway.main.tags["environment"] == var.environment
    error_message = "Internet Gateway must have 'environment' tag."
  }
}

# ─────────────────────────────────────────────
# NAT Gateway & EIP
# ─────────────────────────────────────────────
run "nat_eip_is_vpc_scoped" {
  command = plan

  assert {
    condition     = aws_eip.nat.domain == "vpc"
    error_message = "NAT Gateway EIP must be scoped to 'vpc'."
  }
}

run "nat_eip_has_required_tags" {
  command = plan

  assert {
    condition     = aws_eip.nat.tags["project"] == var.project_name
    error_message = "NAT EIP must have 'project' tag."
  }

  assert {
    condition     = aws_eip.nat.tags["environment"] == var.environment
    error_message = "NAT EIP must have 'environment' tag."
  }
}

run "nat_gateway_has_required_tags" {
  command = plan

  assert {
    condition     = aws_nat_gateway.main.tags["project"] == var.project_name
    error_message = "NAT Gateway must have 'project' tag."
  }

  assert {
    condition     = aws_nat_gateway.main.tags["environment"] == var.environment
    error_message = "NAT Gateway must have 'environment' tag."
  }
}

# ─────────────────────────────────────────────
# Route Tables
# ─────────────────────────────────────────────
run "route_tables_have_required_tags" {
  command = plan

  assert {
    condition     = aws_route_table.public.tags["project"] == var.project_name
    error_message = "Public route table must have 'project' tag."
  }

  assert {
    condition     = aws_route_table.public.tags["environment"] == var.environment
    error_message = "Public route table must have 'environment' tag."
  }

  assert {
    condition     = aws_route_table.private.tags["project"] == var.project_name
    error_message = "Private route table must have 'project' tag."
  }

  assert {
    condition     = aws_route_table.private.tags["environment"] == var.environment
    error_message = "Private route table must have 'environment' tag."
  }
}

run "public_route_table_association_count" {
  command = plan

  assert {
    condition     = length(aws_route_table_association.public) == length(var.public_subnet_cidrs)
    error_message = "Must have one public route table association per public subnet."
  }
}

run "private_route_table_association_count" {
  command = plan

  assert {
    condition     = length(aws_route_table_association.private) == length(var.private_subnet_cidrs)
    error_message = "Must have one private route table association per private subnet."
  }
}
