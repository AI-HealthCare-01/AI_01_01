# 저장 설계 메모

- Firebase 계정 생성 직후:
  - firebase_uid 확보
  - 내부 user_id 발급
  - account_status = pending_email_verification
- 이메일 확인 완료 후:
  - email_verified = true
  - account_status = active_onboarding_required
- 온보딩 완료 후:
  - onboarding_status = complete
  - account_status = active
  - baseline assessment 저장
  - dashboard/model bootstrap 플래그 갱신
