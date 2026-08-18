# ── EKS Cluster Role ──────────────────────────────────────────────────────────
# The control plane assumes this role to manage AWS resources on your behalf
# (create load balancers, describe EC2 instances, etc.).

data "aws_iam_policy_document" "eks_cluster_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eks_cluster" {
  name               = "${var.project_name}-eks-cluster-role"
  assume_role_policy = data.aws_iam_policy_document.eks_cluster_assume_role.json
}

resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

# ── EKS Node Role ─────────────────────────────────────────────────────────────
# Worker nodes assume this role.  Three managed policies are required:
#   AmazonEKSWorkerNodePolicy    — lets nodes register with the cluster
#   AmazonEKS_CNI_Policy         — lets the VPC CNI plugin manage ENIs
#   AmazonEC2ContainerRegistryReadOnly — lets nodes pull images from ECR

data "aws_iam_policy_document" "eks_node_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eks_node" {
  name               = "${var.project_name}-eks-node-role"
  assume_role_policy = data.aws_iam_policy_document.eks_node_assume_role.json
}

resource "aws_iam_role_policy_attachment" "eks_worker_node_policy" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}

resource "aws_iam_role_policy_attachment" "eks_cni_policy" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
}

resource "aws_iam_role_policy_attachment" "eks_ecr_readonly" {
  role = aws_iam_role.eks_node.name
  # Grants read-only access to all ECR repos in the account so nodes can
  # pull the booking-api, booking-worker, and status-service images.
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# ── OIDC Provider ─────────────────────────────────────────────────────────────
# Required for IRSA (IAM Roles for Service Accounts).
# IRSA lets individual pods assume a scoped IAM role via a projected service-
# account token, rather than inheriting every permission granted to the node.
# This is the prerequisite for later adding fine-grained RDS / Secrets Manager
# access without widening the node role.

data "tls_certificate" "eks" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer
}
