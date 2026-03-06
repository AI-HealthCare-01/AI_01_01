# 승인 워크플로우

## 정책 변경
draft -> pending_owner_approval -> approved/rejected -> applied

### 설명
- Admin이 초안을 만들 수 있음
- Owner가 승인해야만 실제 적용 가능
- applied 후에도 audit_log 기록

## 모델 변경/배포
draft_experiment -> training_running -> evaluation_ready -> pending_owner_approval -> approved/rejected -> deployed/rolled_back

### 설명
- Admin 또는 확장 권한을 가진 Support가 재학습 요청/평가 준비 가능
- 배포는 Owner 승인 후에만 가능
- 롤백도 Owner 승인 원칙(긴급 운영 예외 정책이 있으면 별도 정의)
