# ── Networking ────────────────────────────────────────────────────────────────

output "vpc_id" {
  description = "ID of the VPC."
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of the two public subnets (load-balancer placement)."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the two private subnets (EKS nodes + RDS)."
  value       = aws_subnet.private[*].id
}

# ── EKS ───────────────────────────────────────────────────────────────────────

output "eks_cluster_name" {
  description = "EKS cluster name — pass to `aws eks update-kubeconfig --name <value>`."
  value       = aws_eks_cluster.main.name
}

output "eks_cluster_endpoint" {
  description = "Kubernetes API server endpoint."
  value       = aws_eks_cluster.main.endpoint
}

output "eks_cluster_ca_certificate" {
  description = "Base64-encoded certificate authority data for the cluster."
  value       = aws_eks_cluster.main.certificate_authority[0].data
  sensitive   = true
}

output "eks_node_role_arn" {
  description = "ARN of the IAM role attached to EKS worker nodes."
  value       = aws_iam_role.eks_node.arn
}

output "eks_oidc_provider_arn" {
  description = "ARN of the OIDC provider — required when creating IRSA roles for pods."
  value       = aws_iam_openid_connect_provider.eks.arn
}

output "eks_oidc_provider_url" {
  description = "OIDC issuer URL (without https://) — used as the condition key in IRSA trust policies."
  value       = replace(aws_eks_cluster.main.identity[0].oidc[0].issuer, "https://", "")
}

# ── RDS ───────────────────────────────────────────────────────────────────────

output "rds_address" {
  description = "RDS hostname (without port). Use in DATABASE_URL."
  value       = aws_db_instance.postgres.address
}

output "rds_port" {
  description = "RDS port."
  value       = aws_db_instance.postgres.port
}

output "rds_endpoint" {
  description = "RDS endpoint in host:port format."
  value       = aws_db_instance.postgres.endpoint
}

output "rds_db_name" {
  description = "Name of the Postgres database."
  value       = aws_db_instance.postgres.db_name
}

# ── Kubectl config hint ───────────────────────────────────────────────────────

output "kubeconfig_command" {
  description = "Run this command to configure kubectl for the new cluster."
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${aws_eks_cluster.main.name}"
}
