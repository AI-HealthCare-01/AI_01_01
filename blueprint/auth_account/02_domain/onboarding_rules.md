# 온보딩 규칙

## 출생년도
- 입력 형태: YYYY 4자리
- 표시 문구: '출생년도'
- 사용 목적:
  - 파생 나이(age_years_derived) 계산
  - 추천/통계 정확도 향상
- 파생:
  - age_years_derived = current_year - birth_year

## 성별
- 선택값:
  - 여성
  - 남성
  - 논바이너리
  - 응답 안 함
- 필수 아님

## 초기 진단척도
- 1회 필수
- 완료 전에는 홈 진입 불가
- baseline_assessment로 저장하고 periodic_assessment와 호환되게 관리
