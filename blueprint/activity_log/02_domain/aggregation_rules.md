# 파생 규칙

## 사용자용 활동로그
- 1행 = 1유저 1일
- 사용자에게 보여주기 위한 day summary
- 원천 로그에서 파생 생성

## 집계 원천
- 체크인: `daily_checkin`
- 챌린지: `challenge_day_log`, `challenge_enrollment`
- CBT: `cbt_session_summary`
- 일기: `journal_entry`
- 설문: `periodic_assessment`

## 활동 수 계산
- activity_count_total = 체크인(0/1) + 챌린지 수행일(0/1) + CBT 세션 존재(0/1) + 일기 작성(0/1) + 설문 수행(0/1)

## 프라이버시
- 활동로그 기본 리스트에서는 일기/CBT 본문 전체 미노출
- 일기는 제목 또는 첫 줄 20-30자만 preview_text로 사용
- 제목이 없으면 본문 첫 줄 일부를 사용
