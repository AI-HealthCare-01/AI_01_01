# AWS Deployment Scaffold

이 디렉터리는 MindSight의 AWS 배포 스캐폴드(초안)입니다.

## 포함 범위

- `web` (Next.js) 서비스
- `api` (container) 서비스
- `db` (PostgreSQL on RDS)
- `files` (S3 버킷)
- 환경 분리: `staging`, `prod`
- GitHub Actions 초안: 이미지 빌드 + Terraform plan/apply

## 디렉터리 구조

```text
infra/aws/
  docker/
    web.Dockerfile
    api.Dockerfile
  terraform/
    modules/
      stack/
        main.tf
        variables.tf
        outputs.tf
    environments/
      staging/
        providers.tf
        variables.tf
        main.tf
        terraform.tfvars.example
        backend.hcl.example
      prod/
        providers.tf
        variables.tf
        main.tf
        terraform.tfvars.example
        backend.hcl.example
```

## 아키텍처(초안)

- ALB 1개
  - `/v1/*`, `/healthz` -> API target group
  - 그 외 경로 -> WEB target group
- ECS Fargate
  - `web` 서비스
  - `api` 서비스
- RDS PostgreSQL
- S3 버킷(파일 업로드)
- ECR 리포지토리(web/api)
- CloudWatch 로그 그룹(web/api)

## 빠른 시작 (수동)

예시: staging

```bash
cd infra/aws/terraform/environments/staging
cp terraform.tfvars.example terraform.tfvars
# db_password, image_uri 등 값 수정

terraform init -backend-config=backend.hcl.example
terraform plan
terraform apply
```

> 이 스캐폴드는 구조 초안이며, 운영 적용 전 보안/네트워크 세부 설계를 보강해야 합니다.

## GitHub Actions 초안

- `aws-deploy-staging.yml`: `develop` push 또는 수동 실행
- `aws-deploy-prod.yml`: 수동 실행 전용
- 현재 워크플로우는 `terraform init -backend=false` 를 사용합니다.
  - 실제 운영 전에는 S3 + DynamoDB backend로 전환하세요.

필수 GitHub Secrets 예시:

- staging
  - `AWS_GHA_ROLE_ARN_STAGING`
  - `ECR_WEB_REPOSITORY_URI_STAGING`
  - `ECR_API_REPOSITORY_URI_STAGING`
  - `TF_VAR_DB_PASSWORD_STAGING`
- prod
  - `AWS_GHA_ROLE_ARN_PROD`
  - `ECR_WEB_REPOSITORY_URI_PROD`
  - `ECR_API_REPOSITORY_URI_PROD`
  - `TF_VAR_DB_PASSWORD_PROD`
  - `TF_VAR_ACM_CERTIFICATE_ARN_PROD`

## 운영 전 필수 보강 TODO

- VPC private subnet + NAT 구성
- DB 비밀번호를 Secrets Manager/SSM으로 이관
- ECS task 정의의 민감 env 제거 및 secrets 주입
- ALB + HTTPS(ACM) + Route53 도메인 연결
- WAF, CloudFront(필요 시), 백업/모니터링 정책 강화
- RDS multi-AZ/파라미터 튜닝
- S3 수명주기, 접근 로그, KMS 키 분리
