# ── EKS Control Plane ─────────────────────────────────────────────────────────

resource "aws_eks_cluster" "main" {
  name     = var.eks_cluster_name
  version  = var.eks_kubernetes_version
  role_arn = aws_iam_role.eks_cluster.arn

  vpc_config {
    # Both public and private subnets: control plane ENIs land in private
    # subnets; the public API endpoint is still reachable via the IGW.
    subnet_ids = concat(
      aws_subnet.public[*].id,
      aws_subnet.private[*].id,
    )
    endpoint_public_access  = true
    endpoint_private_access = true
  }

  # Shipping all control-plane log streams to CloudWatch lets you audit
  # auth decisions and diagnose scheduling failures post-hoc.
  enabled_cluster_log_types = [
    "api", "audit", "authenticator", "controllerManager", "scheduler",
  ]

  depends_on = [aws_iam_role_policy_attachment.eks_cluster_policy]

  tags = { Name = var.eks_cluster_name }
}

# ── Managed Node Group ────────────────────────────────────────────────────────

resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.project_name}-nodes"
  node_role_arn   = aws_iam_role.eks_node.arn

  # Nodes in private subnets — outbound via NAT GW, not directly internet-facing.
  subnet_ids     = aws_subnet.private[*].id
  instance_types = [var.eks_node_instance_type]

  scaling_config {
    desired_size = var.eks_node_desired_size
    min_size     = var.eks_node_min_size
    max_size     = var.eks_node_max_size
  }

  update_config {
    # Replace at most one node at a time during version upgrades.
    max_unavailable = 1
  }

  # Node group creation fails if the role policies haven't propagated yet.
  depends_on = [
    aws_iam_role_policy_attachment.eks_worker_node_policy,
    aws_iam_role_policy_attachment.eks_cni_policy,
    aws_iam_role_policy_attachment.eks_ecr_readonly,
  ]

  tags = { Name = "${var.project_name}-node-group" }
}

# ── EBS CSI Driver ────────────────────────────────────────────────────────────
# Kubernetes 1.21+ removed the in-tree AWS EBS provisioner; EBS volumes now
# require the out-of-tree CSI driver.  The driver's controller pod needs AWS
# API access (CreateVolume, AttachVolume, etc.) — IRSA scopes that access to
# this single service account instead of granting it node-wide.

data "aws_iam_policy_document" "ebs_csi_driver_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.eks.arn]
    }

    # Scope the trust to the exact service account the EKS add-on creates.
    condition {
      test     = "StringEquals"
      variable = "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub"
      values   = ["system:serviceaccount:kube-system:ebs-csi-controller-sa"]
    }

    condition {
      test     = "StringEquals"
      variable = "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ebs_csi_driver" {
  name               = "${var.project_name}-ebs-csi-driver-role"
  assume_role_policy = data.aws_iam_policy_document.ebs_csi_driver_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ebs_csi_driver_policy" {
  role       = aws_iam_role.ebs_csi_driver.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

resource "aws_eks_addon" "ebs_csi_driver" {
  cluster_name             = aws_eks_cluster.main.name
  addon_name               = "aws-ebs-csi-driver"
  service_account_role_arn = aws_iam_role.ebs_csi_driver.arn

  # The driver's controller pods must land on real nodes, so the node group
  # must exist before the add-on is installed.  The policy attachment must
  # also be propagated before the add-on tries to call the EBS API.
  depends_on = [
    aws_eks_node_group.main,
    aws_iam_role_policy_attachment.ebs_csi_driver_policy,
  ]
}
