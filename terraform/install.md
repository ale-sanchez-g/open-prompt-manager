# Deploying Open Prompt Manager on AWS with Terraform

This guide walks you through deploying **Open Prompt Manager** on AWS using the Terraform scripts in this directory. The deployment creates a production-ready, highly-available infrastructure that follows AWS security best practices.

---

## Architecture Overview

```
Internet
    │
    ▼
┌─────────────────────────────────────────┐
│              AWS VPC (10.0.0.0/16)      │
│                                         │
│  ┌──────────────┐  ┌──────────────┐    │
│  │ Public Subnet│  │ Public Subnet│    │
│  │  us-east-1a  │  │  us-east-1b  │    │
│  │              │  │              │    │
│  │  ┌─────────┐ │  │              │    │
│  │  │   ALB   │ │  │              │    │
│  │  └────┬────┘ │  │              │    │
│  │       │      │  │              │    │
│  │  ┌────▼────┐ │  │              │    │
│  │  │  NAT GW │ │  │              │    │
│  │  └────┬────┘ │  │              │    │
│  └───────┼──────┘  └──────────────┘    │
│          │                             │
│  ┌───────▼──────┐  ┌──────────────┐    │
│  │Private Subnet│  │Private Subnet│    │
│  │  us-east-1a  │  │  us-east-1b  │    │
│  │              │  │              │    │
│  │  ┌─────────┐ │  │ ┌─────────┐  │    │
│  │  │ Backend │ │  │ │ Backend │  │    │
│  │  │ (ECS)   │ │  │ │ (ECS)   │  │    │
│  │  └─────────┘ │  │ └─────────┘  │    │
│  │  ┌─────────┐ │  │ ┌─────────┐  │    │
│  │  │Frontend │ │  │ │Frontend │  │    │
│  │  │ (ECS)   │ │  │ │ (ECS)   │  │    │
│  │  └─────────┘ │  │ └─────────┘  │    │
│  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────┘
```

### Components

| Component | Description |
|-----------|-------------|
| **VPC** | Isolated virtual network (`10.0.0.0/16`) for all resources. |
| **Public Subnets** | Two subnets (one per AZ) with a route to the Internet Gateway. Host the ALB and NAT Gateway. |
| **Private Subnets** | Two subnets (one per AZ) without a direct internet route. Host the ECS Fargate tasks. |
| **Internet Gateway (IGW)** | Enables inbound/outbound internet traffic for the public subnets. |
| **NAT Gateway** | Sits in the public subnet; allows ECS tasks in private subnets to reach the internet (e.g. to pull images) without being publicly reachable. |
| **Route Tables** | Public RT routes `0.0.0.0/0` → IGW. Private RT routes `0.0.0.0/0` → NAT GW. |
| **Application Load Balancer (ALB)** | Internet-facing; routes `/api/*` paths to the backend and `/*` to the frontend. |
| **ECS Fargate** | Serverless container runtime. Runs backend and frontend tasks in private subnets. |
| **ECR** | Private container image registry for backend and frontend Docker images. |
| **CloudWatch Logs** | Centralised log storage for ECS tasks. |

---

## Prerequisites

Before you begin, ensure you have the following installed and configured:

| Tool | Minimum Version | Install |
|------|----------------|---------|
| [Terraform](https://developer.hashicorp.com/terraform/downloads) | 1.5.0 | `brew install terraform` |
| [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) | 2.x | `brew install awscli` |
| [Docker](https://docs.docker.com/get-docker/) | 24.x | See official docs |

You also need:
- An **AWS account** with permissions to create VPCs, ECS, ECR, IAM, ALB, and CloudWatch resources.
- AWS credentials configured locally (`aws configure` or environment variables).

---

## Step 1 – Configure AWS Credentials

```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, region (e.g. us-east-1), and output format
```

Verify the credentials work:

```bash
aws sts get-caller-identity
```

---

## Step 2 – Build and Push Docker Images

The Terraform scripts reference Docker images stored in Amazon ECR. You must build and push the images before (or alongside) running `terraform apply`.

### 2a – Bootstrap ECR repositories first

Run Terraform with a targeted apply to create only the ECR repositories:

```bash
cd terraform/
terraform init
terraform apply -target=aws_ecr_repository.backend -target=aws_ecr_repository.frontend
```

### 2b – Build and push the backend image

```bash
# Export variables for convenience
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export BACKEND_REPO="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/open-prompt-manager-backend"

# Authenticate Docker to ECR
aws ecr get-login-password --region "${AWS_REGION}" | \
  docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Build and push
docker build -t "${BACKEND_REPO}:latest" ../backend/
docker push "${BACKEND_REPO}:latest"
```

### 2c – Build and push the frontend image

```bash
export FRONTEND_REPO="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/open-prompt-manager-frontend"

docker build -t "${FRONTEND_REPO}:latest" ../frontend/
docker push "${FRONTEND_REPO}:latest"
```

---

## Step 3 – Initialise Terraform

```bash
cd terraform/   # already here if you followed step 2
terraform init
```

Expected output:

```
Terraform has been successfully initialized!
```

---

## Step 4 – Review the Deployment Plan

```bash
terraform plan
```

Review the resources that will be created. Key items to confirm:
- 1 VPC
- 2 public subnets, 2 private subnets
- 1 Internet Gateway
- 1 NAT Gateway + 1 Elastic IP
- 2 Route Tables (public and private) with associations
- 1 Application Load Balancer
- 2 ECS services (backend, frontend) in private subnets
- 2 ECR repositories
- IAM roles for ECS task execution

---

## Step 5 – Apply the Terraform Configuration

```bash
terraform apply
```

Type `yes` when prompted to confirm. The full deployment takes approximately **3–5 minutes**.

At the end, Terraform prints the output values:

```
Outputs:

alb_dns_name                 = "open-prompt-manager-alb-XXXXXXXXXX.us-east-1.elb.amazonaws.com"
application_url              = "http://open-prompt-manager-alb-XXXXXXXXXX.us-east-1.elb.amazonaws.com"
backend_ecr_repository_url   = "XXXXXXXXXXXX.dkr.ecr.us-east-1.amazonaws.com/open-prompt-manager-backend"
ecs_cluster_name             = "open-prompt-manager-cluster"
frontend_ecr_repository_url  = "XXXXXXXXXXXX.dkr.ecr.us-east-1.amazonaws.com/open-prompt-manager-frontend"
nat_gateway_public_ip        = "XX.XX.XX.XX"
vpc_id                       = "vpc-XXXXXXXXXXXXXXXXX"
```

Open the `application_url` in your browser to access Open Prompt Manager.

---

## Step 6 – Verify the Deployment

```bash
# Check ECS services are running
aws ecs list-services --cluster open-prompt-manager-cluster

# Check tasks are healthy
aws ecs list-tasks --cluster open-prompt-manager-cluster

# Describe a task to confirm it is RUNNING
aws ecs describe-tasks \
  --cluster open-prompt-manager-cluster \
  --tasks $(aws ecs list-tasks --cluster open-prompt-manager-cluster --query 'taskArns[0]' --output text)

# Check ALB target group health
aws elbv2 describe-target-health \
  --target-group-arn "$(terraform output -raw backend_target_group_arn)"
```

You can also access the API directly:

```bash
ALB_URL=$(terraform output -raw application_url)

# Health check
curl "${ALB_URL}/health"

# List prompts
curl "${ALB_URL}/prompts/"
```

---

## Customising the Deployment

Override any variable using a `terraform.tfvars` file or CLI flags:

### Example `terraform.tfvars`

```hcl
aws_region    = "eu-west-1"
environment   = "staging"
project_name  = "open-prompt-manager"

vpc_cidr             = "10.0.0.0/16"
public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs = ["10.0.10.0/24", "10.0.11.0/24"]
availability_zones   = ["eu-west-1a", "eu-west-1b"]

backend_desired_count  = 2
frontend_desired_count = 2
backend_cpu            = 512
backend_memory         = 1024
frontend_cpu           = 256
frontend_memory        = 512
```

### Using CLI flags

```bash
terraform apply \
  -var="aws_region=eu-west-1" \
  -var="environment=staging" \
  -var="backend_desired_count=3"
```

---

## Remote State (Recommended for Teams)

Uncomment and configure the `backend "s3"` block in `versions.tf`, then create the S3 bucket and DynamoDB table:

```bash
# Create S3 bucket for state
aws s3api create-bucket \
  --bucket your-terraform-state-bucket \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket your-terraform-state-bucket \
  --versioning-configuration Status=Enabled

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# Re-initialise Terraform to migrate state to S3
terraform init -migrate-state
```

---

## Updating the Application

To deploy a new version of the application:

```bash
# 1. Build and push a new image with a specific tag
docker build -t "${BACKEND_REPO}:v1.1.0" ../backend/
docker push "${BACKEND_REPO}:v1.1.0"

# 2. Update the variable and re-apply
terraform apply -var="backend_image=${BACKEND_REPO}:v1.1.0"
```

ECS performs a rolling update with zero downtime.

---

## Tearing Down the Infrastructure

To destroy all resources created by Terraform:

```bash
terraform destroy
```

> **Warning:** This permanently deletes all resources including the VPC, ECS services, load balancer, and ECR repositories (with all stored images). Make sure you have backed up any data you want to keep.

---

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| ECS tasks fail to start | Image not found in ECR | Re-push the Docker image (Step 2) |
| Tasks stuck in `PENDING` | IAM execution role missing permissions | Check `aws_iam_role.ecs_task_execution` attachments |
| ALB returns 502 | Container unhealthy or port mismatch | Check CloudWatch Logs and health check settings |
| `terraform apply` fails on NAT GW | Elastic IP limit reached | Request a limit increase in AWS console |
| Cannot pull images from ECR | NAT Gateway not yet ready | Wait a few minutes and retry; NAT GW provisioning takes ~2 min |

### View ECS logs

```bash
aws logs tail /ecs/open-prompt-manager/backend --follow
aws logs tail /ecs/open-prompt-manager/frontend --follow
```

---

## Database (Amazon RDS PostgreSQL)

The Terraform configuration provisions an Amazon RDS PostgreSQL 16 instance in the private subnets. No extra steps are required — the database is created as part of `terraform apply`.

### What gets created

| Resource | Details |
|---|---|
| `aws_db_instance` | PostgreSQL 16, `db.t4g.micro` by default, encrypted with gp3 storage |
| `aws_db_subnet_group` | Uses the existing private subnets (multi-AZ ready) |
| `aws_security_group.rds` | Port 5432 open only from the backend ECS security group |
| `random_password` | 32-char random password, never stored in state as plain text |
| `aws_secretsmanager_secret` | Full `DATABASE_URL` stored at `<project>/<env>/database-url` |

The `DATABASE_URL` is injected into the backend ECS container as an ECS secret (not a plain-text environment variable). ECS pulls the value from Secrets Manager at task start.

### Retrieve the DATABASE_URL

```bash
aws secretsmanager get-secret-value \
  --secret-id "open-prompt-manager/prod/database-url" \
  --query SecretString --output text
```

### Connect to the database from a local machine

The RDS instance has no public endpoint. Use AWS Systems Manager Session Manager to port-forward through a bastion or an ECS task:

```bash
# Install the Session Manager plugin first: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html

# Start a port-forward session to the RDS host via an ECS container
aws ssm start-session \
  --target <ecs-task-id> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["<rds-endpoint>"],"portNumber":["5432"],"localPortNumber":["5432"]}'

# Then connect locally
psql -h localhost -U dbadmin -d promptmanager
```

Get the RDS endpoint from Terraform outputs:

```bash
terraform output db_endpoint
terraform output db_secret_arn
```

### Customise the database tier

```hcl
# terraform.tfvars
db_instance_class      = "db.t4g.small"   # upgrade for higher throughput
db_allocated_storage   = 50               # GiB
db_multi_az            = true             # enable for production HA
db_deletion_protection = true             # prevent accidental drops
```

> **Note:** Enabling `db_deletion_protection = true` also triggers a final RDS snapshot before any `terraform destroy`.

---

## File Reference

```
terraform/
├── versions.tf          # Terraform and AWS provider version constraints
├── variables.tf         # All input variables with defaults
├── vpc.tf               # VPC, subnets, IGW, NAT Gateway, route tables
├── security_groups.tf   # Security groups for ALB, frontend, backend, and RDS
├── iam.tf               # IAM roles for ECS task execution + Secrets Manager policy
├── ecr.tf               # ECR repositories and lifecycle policies
├── alb.tf               # Application Load Balancer, target groups, listener rules
├── ecs.tf               # ECS cluster, task definitions, and services (Fargate)
├── rds.tf               # RDS PostgreSQL, DB subnet group, and Secrets Manager secret
├── outputs.tf           # Output values (URLs, IDs, DB endpoint, secret ARN)
└── install.md           # This file
```
