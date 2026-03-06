module "stack" {
  source = "../../modules/stack"

  project_name = var.project_name
  environment  = "prod"
  aws_region   = var.aws_region

  web_image_uri = var.web_image_uri
  api_image_uri = var.api_image_uri

  vpc_cidr            = "10.60.0.0/16"
  public_subnet_cidrs = ["10.60.0.0/20", "10.60.16.0/20"]

  web_desired_count = 2
  api_desired_count = 2

  web_container_cpu    = 1024
  web_container_memory = 2048
  api_container_cpu    = 1024
  api_container_memory = 2048

  db_name                = "mindsight"
  db_username            = "mindsight_app"
  db_password            = var.db_password
  db_instance_class      = "db.t4g.small"
  db_allocated_storage   = 50
  db_skip_final_snapshot = false

  s3_force_destroy = false

  enable_https        = true
  acm_certificate_arn = var.acm_certificate_arn
  web_env_vars        = var.web_env_vars
  api_env_vars        = var.api_env_vars

  tags = {
    Service = "mindsight"
    Stage   = "prod"
  }
}

output "alb_dns_name" {
  value = module.stack.alb_dns_name
}

output "files_bucket_name" {
  value = module.stack.files_bucket_name
}

output "web_ecr_repository_url" {
  value = module.stack.web_ecr_repository_url
}

output "api_ecr_repository_url" {
  value = module.stack.api_ecr_repository_url
}
