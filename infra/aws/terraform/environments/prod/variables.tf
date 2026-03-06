variable "project_name" {
  description = "Project name used for resource names"
  type        = string
  default     = "mindsight"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "db_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}

variable "web_image_uri" {
  description = "Web container image URI"
  type        = string
  default     = "000000000000.dkr.ecr.ap-northeast-2.amazonaws.com/mindsight-prod-web:latest"
}

variable "api_image_uri" {
  description = "API container image URI"
  type        = string
  default     = "000000000000.dkr.ecr.ap-northeast-2.amazonaws.com/mindsight-prod-api:latest"
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for production HTTPS"
  type        = string
}

variable "web_env_vars" {
  description = "Extra web env vars"
  type        = map(string)
  default     = {}
}

variable "api_env_vars" {
  description = "Extra api env vars"
  type        = map(string)
  default     = {}
}
