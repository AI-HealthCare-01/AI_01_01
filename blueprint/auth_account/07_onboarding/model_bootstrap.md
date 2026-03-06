# 온보딩 -> 모델 / 대시보드 초기값 연결

## 입력
- birth_year
- gender(optional)
- 민감정보 동의
- 초기 진단척도 결과

## 저장
- account_profile
- account_consent
- baseline_assessment
- periodic_assessment 호환 저장
- account_onboarding 상태 갱신

## 파생
- age_years_derived = current_year - birth_year
- latest assessment scores
- initial dashboard cards
- initial nowcast anchors
- ml_subject_id 매핑 확인

## 완료 조건
- birth_year 저장
- 필수 동의 저장
- baseline assessment 완료
- dashboard_bootstrapped = true
- model_bootstrapped = true
- onboarding_status = complete
- account_status = active
