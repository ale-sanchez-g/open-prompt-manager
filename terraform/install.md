# Deploying Open Prompt Manager on AWS with Terraform

This guide walks you through deploying **Open Prompt Manager** on AWS using the Terraform scripts in this directory. The deployment creates a production-ready, highly-available infrastructure that follows AWS security best practices.

---

## Architecture Overview

```
Internet
    │
    ▼
┌──────────────────────────────────────────────────┐
│                AWS VPC (10.0.0.0/16)             │
│                                                  │
│  ┌───────────────┐   ┌───────────────┐           │
│  │ Public Subnet │   │ Public Subnet │           │
│  │  us-east-1a   │   │  us-east-1b   │           │
│  │               │   │               │           │
│  │  ┌──────────┐ │   │               │           │
│  │  │   ALB    │ │   │               │           │
│  │  └────┬─────┘ │   │               │           │
│  │       │       │   │               │           │
│  │  ┌────▼─────┐ │   │               │           │
│  │  │  NAT GW  │ │   │               │           │
│  │  └────┬─────┘ │   │               │           │
│  └────────┼───────┘   └───────────────┘           │
│           │                                       │
│  ┌────────▼───────┐   ┌───────────────┐           │
│  │ Private Subnet │   │ Private Subnet│           │
│  │  us-east-1a    │   │  us-east-1b   │           │
│  │                │   │               │           │
│  │  ┌──────────┐  │   │ ┌──────────┐  │           │
│  │  │ Backend  │  │   │ │ Backend  │  │           │
│  │  │  (ECS)   │  │   │ │  (ECS)   │  │           │
│  │  └────┬─────┘  │   │ └────┬─────┘  │           │
│  │       │        │   │      │        │           │
│  │  ┌────▼─────┐  │   │ ┌────▼─────┐  │           │
│  │  │ Frontend │  │   │ │ Frontend │  │           │
│  │  │  (ECS)   │  │   │ │  (ECS)   │  │           │
│  │  └──────────┘  │   │ └──────────┘  │           │
│  │                │   │               │           │
│  │  ┌─────────────┴───┴──────────┐    │           │
│  │  │   RDS PostgreSQL 16         │   │           │
│  │  │   (private, encrypted)      │   │           │
│  └──┤   db.t4g.micro / gp3        ├───┘           │
│     └─────────────────────────────┘               │
└──────────────────────────────────────────────────┘
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
| **Application Load Balancer (ALB)** | Internet-facing; two listener rules route traffic to the backend: priority 10 (`/api/*` → REST API) and priority 20 (`/mcp`, `/mcp/*` → MCP server). Everything else goes to the frontend React SPA. |
| **RDS PostgreSQL 16** | Single-AZ `db.t4g.micro` in the private subnets. Password auto-generated and stored in AWS Secrets Manager; injected into the backend container at runtime. Port 5432 is open only from the backend ECS security group. |
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

# Build and push (--platform linux/amd64 is required when building on Apple Silicon)
docker buildx build --platform linux/amd64 -t "${BACKEND_REPO}:latest" ../backend/ --push
```

> **Note (Apple Silicon / ARM):** ECS Fargate runs on `linux/amd64`. If you build on an Apple Silicon Mac without specifying `--platform linux/amd64`, ECS will fail to start the container with a `CannotPullContainerError: image Manifest does not contain descriptor matching platform 'linux/amd64'`. Always use `docker buildx build --platform linux/amd64` when targeting ECS Fargate.

### 2c – Build and push the frontend image

```bash
export FRONTEND_REPO="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/open-prompt-manager-frontend"

# Build and push (--platform linux/amd64 required on Apple Silicon)
docker buildx build --platform linux/amd64 -t "${FRONTEND_REPO}:latest" ../frontend/ --push
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
- 1 Application Load Balancer with **2 backend listener rules**:
  - priority 10: `/api/*` → backend REST API
  - priority 20: `/mcp`, `/mcp/*` → backend MCP server
- 2 ECS services (backend, frontend) in private subnets
- 2 ECR repositories
- IAM roles for ECS task execution
- 1 RDS PostgreSQL 16 instance (`db.t4g.micro`) in private subnets
- 1 Secrets Manager secret containing the `DATABASE_URL`

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
mcp_url                      = "http://open-prompt-manager-alb-XXXXXXXXXX.us-east-1.elb.amazonaws.com/mcp"
backend_ecr_repository_url   = "XXXXXXXXXXXX.dkr.ecr.us-east-1.amazonaws.com/open-prompt-manager-backend"
backend_target_group_arn     = "arn:aws:elasticloadbalancing:us-east-1:XXXXXXXXXXXX:targetgroup/open-prompt-manager-backend-tg/XXXXXXXXXXXXXXXX"
db_endpoint                  = "open-prompt-manager-prod.XXXXXXXXXXXX.us-east-1.rds.amazonaws.com:5432"
db_name                      = "promptmanager"
db_secret_arn                = "arn:aws:secretsmanager:us-east-1:XXXXXXXXXXXX:secret:open-prompt-manager/prod/database-url-XXXXXX"
ecs_cluster_name             = "open-prompt-manager-cluster"
frontend_ecr_repository_url  = "XXXXXXXXXXXX.dkr.ecr.us-east-1.amazonaws.com/open-prompt-manager-frontend"
frontend_target_group_arn    = "arn:aws:elasticloadbalancing:us-east-1:XXXXXXXXXXXX:targetgroup/open-prompt-manager-frontend-tg/XXXXXXXXXXXXXXXX"
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
curl "${ALB_URL}/api/health"

# List prompts
curl "${ALB_URL}/api/prompts/"
```

Verify the MCP server is reachable:

```bash
MCP_URL=$(terraform output -raw mcp_url)

# Initialize an MCP session (returns 200 with session details)
curl -i -X POST "${MCP_URL}" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl-test","version":"1.0"}}}'
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
#    Always include --platform linux/amd64 when building on Apple Silicon
docker buildx build --platform linux/amd64 \
  -t "${BACKEND_REPO}:v1.1.0" ../backend/ --push

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
| MCP clients receive `403 Forbidden` | `MCP_ALLOWED_HOSTS` not set or missing the ALB hostname | The ECS task definition automatically sets `MCP_ALLOWED_HOSTS` to the ALB DNS name. If you added a custom domain, add it via `terraform apply -var="..."` or override the env var | 
| MCP clients receive `404` on `/mcp` | ALB listener rule for `/mcp` not created | Run `terraform apply`; the `aws_lb_listener_rule.backend_mcp` rule (priority 20) must exist |
| ECS tasks fail to start | Image not found in ECR | Re-push the Docker image (Step 2) |
| `CannotPullContainerError: image Manifest does not contain descriptor matching platform 'linux/amd64'` | Image built on Apple Silicon (ARM) without `--platform linux/amd64` | Rebuild with `docker buildx build --platform linux/amd64 … --push` (Step 2b/2c) |
| Tasks stuck in `PENDING` | IAM execution role missing permissions | Check `aws_iam_role.ecs_task_execution` attachments |
| ALB returns 502 | Container unhealthy or port mismatch | Check CloudWatch Logs and health check settings |
| `terraform apply` fails on NAT GW | Elastic IP limit reached | Request a limit increase in AWS console |
| Cannot pull images from ECR | NAT Gateway not yet ready | Wait a few minutes and retry; NAT GW provisioning takes ~2 min |
| `ValidationError: A rule can only have '5' condition values` | ALB listener rule `path_pattern` exceeded the 5-value AWS limit | The configuration already uses two separate rules (priorities 10 and 11) to work around this limit — no action needed |
| Backend container crashes with `ModuleNotFoundError: No module named 'psycopg2'` | Missing PostgreSQL driver | `psycopg2-binary` is included in `backend/requirements.txt`; rebuild and re-push the backend image |

### View ECS logs

```bash
aws logs tail /ecs/open-prompt-manager/backend --follow
aws logs tail /ecs/open-prompt-manager/frontend --follow
```

---

## MCP Server (AI Agent Connectivity)

The backend exposes a **Model Context Protocol (MCP)** server at `/mcp`. This lets AI agents (Claude, Cursor, VS Code Copilot, etc.) discover and use your prompts programmatically via standardised tool calls.

### How it works in AWS

| Layer | What happens |
|---|---|
| ALB listener rule (priority 20) | Routes `/mcp` and `/mcp/*` to the backend target group |
| ECS backend container | `MCP_ALLOWED_HOSTS` is automatically set to the ALB DNS name so the host-validation middleware accepts requests arriving through the load balancer |
| MCP server | Mounted at `/mcp`; runs in stateless HTTP mode — every request is self-contained |

### Connecting an AI agent

Use the `mcp_url` Terraform output as the server URL in your MCP client configuration:

```bash
MCP_URL=$(terraform output -raw mcp_url)
echo "MCP endpoint: ${MCP_URL}"
# e.g. http://open-prompt-manager-alb-XXXXXXXXXX.us-east-1.elb.amazonaws.com/mcp
```

**Example: Claude Desktop (`claude_desktop_config.json`)**

```json
{
  "mcpServers": {
    "open-prompt-manager": {
      "url": "http://<alb-dns-name>/mcp"
    }
  }
}
```

**Example: VS Code (`settings.json`)**

```json
{
  "mcp": {
    "servers": {
      "open-prompt-manager": {
        "type": "http",
        "url": "http://<alb-dns-name>/mcp"
      }
    }
  }
}
```

Replace `<alb-dns-name>` with the value of `terraform output -raw alb_dns_name`.

### Adding a custom domain to MCP_ALLOWED_HOSTS

If you front the ALB with a custom domain (e.g., via Route 53), you must add it to the allowed hosts list. Override the environment variable in the ECS task definition by adding a `tfvars` entry or by editing `ecs.tf`:

```hcl
# In ecs.tf – extend the environment block of the backend container
{
  name  = "MCP_ALLOWED_HOSTS"
  value = "${aws_lb.main.dns_name},prompts.example.com"
}
```

Then run `terraform apply` to redeploy the backend task.

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
