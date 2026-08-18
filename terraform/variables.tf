# ── General ───────────────────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short identifier prepended to every resource name."
  type        = string
  default     = "event-booking"
}

variable "environment" {
  description = "Deployment tier — used in tags and can gate behaviour (dev / staging / prod)."
  type        = string
  default     = "dev"
}

# ── Networking ────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

# ── EKS ───────────────────────────────────────────────────────────────────────

variable "eks_cluster_name" {
  description = "Name of the EKS cluster."
  type        = string
  default     = "event-booking-eks"
}

variable "eks_kubernetes_version" {
  description = "Kubernetes control-plane version. Check `aws eks describe-addon-versions` for supported values."
  type        = string
  default     = "1.34"
}

variable "eks_node_instance_type" {
  description = "EC2 instance type for managed node group workers."
  type        = string
  default     = "t3.medium"
}

variable "eks_node_desired_size" {
  description = "Initial number of worker nodes."
  type        = number
  default     = 2
}

variable "eks_node_min_size" {
  description = "Minimum number of worker nodes (HPA lower bound)."
  type        = number
  default     = 2
}

variable "eks_node_max_size" {
  description = "Maximum number of worker nodes (HPA upper bound)."
  type        = number
  default     = 6
}

# ── RDS ───────────────────────────────────────────────────────────────────────

variable "rds_instance_class" {
  description = "RDS instance class. Use db.t3.micro for dev, db.t3.medium+ for prod."
  type        = string
  default     = "db.t3.micro"
}

variable "rds_db_name" {
  description = "Name of the Postgres database to create on first boot."
  type        = string
  default     = "bookings"
}

variable "rds_username" {
  description = "RDS master username."
  type        = string
  default     = "bookings"
}

variable "rds_password" {
  description = "RDS master password. Supply via TF_VAR_rds_password or a .tfvars file — never hardcode."
  type        = string
  sensitive   = true
}

variable "rds_allocated_storage" {
  description = "Initial allocated storage in GiB. Auto-scaling will grow up to 2x this value."
  type        = number
  default     = 20
}

variable "rds_multi_az" {
  description = "Enable Multi-AZ standby for RDS. Set to true for production."
  type        = bool
  default     = false
}
