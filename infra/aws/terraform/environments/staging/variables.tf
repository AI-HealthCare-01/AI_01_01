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
  default     = "000000000000.dkr.ecr.ap-northeast-2.amazonaws.com/mindsight-staging-web:latest"
}

variable "api_image_uri" {
  description = "API container image URI"
  type        = string
  default     = "000000000000.dkr.ecr.ap-northeast-2.amazonaws.com/mindsight-staging-api:latest"
}

variable "enable_https" {
  description = "Enable HTTPS listener"
  type        = bool
  default     = false
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN (required when enable_https=true)"
  type        = string
  default     = null
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
