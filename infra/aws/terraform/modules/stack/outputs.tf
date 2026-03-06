output "alb_dns_name" {
  description = "Public DNS name of the application load balancer"
  value       = aws_lb.main.dns_name
}

output "web_ecr_repository_url" {
  description = "ECR repository URL for web image"
  value       = aws_ecr_repository.web.repository_url
}

output "api_ecr_repository_url" {
  description = "ECR repository URL for api image"
  value       = aws_ecr_repository.api.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "web_service_name" {
  description = "Web ECS service name"
  value       = aws_ecs_service.web.name
}

output "api_service_name" {
  description = "API ECS service name"
  value       = aws_ecs_service.api.name
}

output "db_endpoint" {
  description = "RDS endpoint hostname"
  value       = aws_db_instance.postgres.address
}

output "files_bucket_name" {
  description = "S3 bucket name for uploaded files"
  value       = aws_s3_bucket.files.bucket
}
