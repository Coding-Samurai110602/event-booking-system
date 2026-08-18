terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    # tls provider is used in iam.tf to fetch the EKS OIDC thumbprint
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Local state — fine for solo development.
  # To collaborate with a team, swap this block for an S3 backend:
  #
  #   backend "s3" {
  #     bucket         = "<your-tf-state-bucket>"
  #     key            = "event-booking/terraform.tfstate"
  #     region         = "us-east-1"
  #     dynamodb_table = "<your-lock-table>"
  #     encrypt        = true
  #   }
  backend "local" {}
}

provider "aws" {
  region = var.aws_region

  # These tags are applied to every resource that supports tagging,
  # so cost allocation and compliance filters work without touching each resource.
  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
