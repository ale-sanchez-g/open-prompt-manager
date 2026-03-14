# ─────────────────────────────────────────────
# VPC
# ─────────────────────────────────────────────
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name        = "${var.project_name}-vpc"
    project     = var.project_name
    environment = var.environment
  }
}

# ─────────────────────────────────────────────
# Internet Gateway
# ─────────────────────────────────────────────
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name        = "${var.project_name}-igw"
    project     = var.project_name
    environment = var.environment
  }
}

# ─────────────────────────────────────────────
# Public Subnets
# Each public subnet has a direct route to the
# Internet Gateway and hosts the NAT Gateway.
# ─────────────────────────────────────────────
resource "aws_subnet" "public" {
  count = length(var.public_subnet_cidrs)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name        = "${var.project_name}-public-subnet-${count.index + 1}"
    Tier        = "Public"
    project     = var.project_name
    environment = var.environment
  }
}

# ─────────────────────────────────────────────
# Private Subnets
# Application servers (ECS Fargate tasks) run
# here; outbound traffic leaves through the
# NAT Gateway in the public subnet.
# ─────────────────────────────────────────────
resource "aws_subnet" "private" {
  count = length(var.private_subnet_cidrs)

  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name        = "${var.project_name}-private-subnet-${count.index + 1}"
    Tier        = "Private"
    project     = var.project_name
    environment = var.environment
  }
}

# ─────────────────────────────────────────────
# Elastic IP for NAT Gateway
# ─────────────────────────────────────────────
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name        = "${var.project_name}-nat-eip"
    project     = var.project_name
    environment = var.environment
  }

  depends_on = [aws_internet_gateway.main]
}

# ─────────────────────────────────────────────
# NAT Gateway
# Resides in the first public subnet and
# enables outbound internet traffic for
# resources in private subnets.
# ─────────────────────────────────────────────
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name        = "${var.project_name}-nat-gateway"
    project     = var.project_name
    environment = var.environment
  }

  depends_on = [aws_internet_gateway.main]
}

# ─────────────────────────────────────────────
# Route Table – Public
# Default route sends all traffic to the IGW.
# ─────────────────────────────────────────────
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name        = "${var.project_name}-public-rt"
    project     = var.project_name
    environment = var.environment
  }
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ─────────────────────────────────────────────
# Route Table – Private
# Default route sends outbound traffic through
# the NAT Gateway so private instances can
# reach the internet without being reachable
# from it.
# ─────────────────────────────────────────────
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = {
    Name        = "${var.project_name}-private-rt"
    project     = var.project_name
    environment = var.environment
  }
}

resource "aws_route_table_association" "private" {
  count = length(aws_subnet.private)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}
