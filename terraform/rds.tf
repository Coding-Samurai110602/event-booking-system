# ── Subnet Group ─────────────────────────────────────────────────────────────
# RDS requires a subnet group spanning at least two AZs even for single-AZ
# instances, so that Multi-AZ can be enabled later without recreation.

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-rds-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${var.project_name}-rds-subnet-group" }
}

# ── Security Group ────────────────────────────────────────────────────────────
# Only pods running on EKS can reach port 5432.  The EKS-managed cluster
# security group (cluster_security_group_id) is automatically attached to every
# worker node by AWS, so this single rule covers all app pods without needing
# to enumerate node security groups individually.

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "Allow Postgres inbound from EKS worker nodes only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres from EKS nodes"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_eks_cluster.main.vpc_config[0].cluster_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-rds-sg" }
}

# ── RDS Instance ──────────────────────────────────────────────────────────────

resource "aws_db_instance" "postgres" {
  identifier = "${var.project_name}-postgres"

  engine         = "postgres"
  engine_version = "16" # AWS pins this to the latest 16.x patch
  instance_class = var.rds_instance_class

  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_allocated_storage * 2 # autoscale storage up to 2x

  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.rds_db_name
  username = var.rds_username
  password = var.rds_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az            = var.rds_multi_az
  publicly_accessible = false

  # 1 day is the minimum RDS allows and fits within the AWS Free Tier account
  # constraint.  Raise to 7–35 days on a paid account for meaningful PITR coverage.
  backup_retention_period = 1
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  # Safe defaults for dev.  Harden for production:
  #   skip_final_snapshot = false
  #   deletion_protection = true
  skip_final_snapshot = true
  deletion_protection = false

  tags = { Name = "${var.project_name}-postgres" }
}
