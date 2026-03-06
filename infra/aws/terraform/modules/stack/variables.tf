variable "project_name" {
  description = "Project name prefix for AWS resources"
  type        = string
}

variable "environment" {
  description = "Deployment environment name (staging or prod)"
  type        = string
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.40.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDRs for public subnets"
  type        = list(string)
  default     = ["10.40.0.0/20", "10.40.16.0/20"]
}

variable "web_image_uri" {
  description = "Full image URI for web container"
  type        = string
}

variable "api_image_uri" {
  description = "Full image URI for api container"
  type        = string
}

variable "web_container_port" {
  description = "Container port for Next.js web app"
  type        = number
  default     = 3000
}

variable "api_container_port" {
  description = "Container port for API app"
  type        = number
  default     = 8000
}

variable "web_container_cpu" {
  description = "Task CPU units for web service"
  type        = number
  default     = 512
}

variable "web_container_memory" {
  description = "Task memory (MiB) for web service"
  type        = number
  default     = 1024
}

variable "api_container_cpu" {
  description = "Task CPU units for api service"
  type        = number
  default     = 512
}

variable "api_container_memory" {
  description = "Task memory (MiB) for api service"
  type        = number
  default     = 1024
}

variable "web_desired_count" {
  description = "Desired ECS task count for web service"
  type        = number
  default     = 1
}

variable "api_desired_count" {
  description = "Desired ECS task count for api service"
  type        = number
  default     = 1
}

variable "assign_public_ip" {
  description = "Assign public IP to ECS tasks"
  type        = bool
  default     = true
}

variable "api_healthcheck_path" {
  description = "Health check path for API target group"
  type        = string
  default     = "/healthz"
}

variable "web_healthcheck_path" {
  description = "Health check path for web target group"
  type        = string
  default     = "/"
}

variable "enable_https" {
  description = "Enable ALB HTTPS listener"
  type        = bool
  default     = false
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS listener"
  type        = string
  default     = null
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "mindsight"
}

variable "db_username" {
  description = "Database username"
  type        = string
  default     = "mindsight_app"
}

variable "db_password" {
  description = "Database password (set securely per environment)"
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GiB"
  type        = number
  default     = 20
}

variable "db_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "15.7"
}

variable "db_skip_final_snapshot" {
  description = "Skip final snapshot on destroy"
  type        = bool
  default     = true
}

variable "s3_force_destroy" {
  description = "Allow destroy on non-empty S3 bucket"
  type        = bool
  default     = false
}

variable "web_env_vars" {
  description = "Extra environment variables for web service"
  type        = map(string)
  default     = {}
}

variable "api_env_vars" {
  description = "Extra environment variables for api service"
  type        = map(string)
  default     = {}
}
