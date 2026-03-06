module "stack" {
  source = "../../modules/stack"

  project_name = var.project_name
  environment  = "staging"
  aws_region   = var.aws_region

  web_image_uri = var.web_image_uri
  api_image_uri = var.api_image_uri

  vpc_cidr            = "10.50.0.0/16"
  public_subnet_cidrs = ["10.50.0.0/20", "10.50.16.0/20"]

  web_desired_count = 1
  api_desired_count = 1

  web_container_cpu    = 512
  web_container_memory = 1024
  api_container_cpu    = 512
  api_container_memory = 1024

  db_name              = "mindsight"
  db_username          = "mindsight_app"
  db_password          = var.db_password
  db_instance_class    = "db.t4g.micro"
  db_allocated_storage = 20
  db_skip_final_snapshot = true

  s3_force_destroy = true

  enable_https         = var.enable_https
  acm_certificate_arn  = var.acm_certificate_arn
  web_env_vars         = var.web_env_vars
  api_env_vars         = var.api_env_vars

  tags = {
    Service = "mindsight"
    Stage   = "staging"
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
