data "aws_availability_zones" "available" {
  state = "available"
}

# ── VPC ───────────────────────────────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true # required for EKS node registration
  enable_dns_support   = true

  tags = { Name = "${var.project_name}-vpc" }
}

# ── Internet Gateway ──────────────────────────────────────────────────────────

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project_name}-igw" }
}

# ── Public Subnets ────────────────────────────────────────────────────────────
# Two subnets across two AZs for load-balancer placement.
# cidrsubnet("10.0.0.0/16", 8, N) carves out 10.0.N.0/24.

resource "aws_subnet" "public" {
  count = 2

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index + 1)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-public-${count.index + 1}"
    # EKS uses these tags to discover subnets when provisioning load balancers.
    "kubernetes.io/cluster/${var.eks_cluster_name}" = "shared"
    "kubernetes.io/role/elb"                        = "1"
  }
}

# ── NAT Gateway ───────────────────────────────────────────────────────────────
# One NAT GW in the first public subnet.  Private-subnet pods route outbound
# traffic (ECR pulls, external API calls) through this gateway.
# For production HA, add a NAT GW per AZ and split the private route table.

resource "aws_eip" "nat" {
  domain     = "vpc"
  depends_on = [aws_internet_gateway.main]
  tags       = { Name = "${var.project_name}-nat-eip" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  depends_on    = [aws_internet_gateway.main]
  tags          = { Name = "${var.project_name}-nat-gw" }
}

# ── Private Subnets ───────────────────────────────────────────────────────────
# EKS worker nodes and RDS live here — not directly reachable from the internet.

resource "aws_subnet" "private" {
  count = 2

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 11)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name                                            = "${var.project_name}-private-${count.index + 1}"
    "kubernetes.io/cluster/${var.eks_cluster_name}" = "shared"
    "kubernetes.io/role/internal-elb"               = "1"
  }
}

# ── Route Tables ──────────────────────────────────────────────────────────────

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${var.project_name}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = { Name = "${var.project_name}-private-rt" }
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}
