# 스케줄(28일 권장, 불규칙 허용)

## 권장
- 28일(4주)마다 1회 수행을 추천(리마인드)

## 실제 기록(불규칙)
- 사용자가 기간을 놓칠 수 있음
- 따라서 다음을 저장한다:
  - scheduled_for (권장일)
  - completed_at (실제 완료일)
  - completion_status: completed / late / missed / skipped / draft
  - overdue_days (권장일 대비 지연일수)

## 리마인드 규칙(예시)
- overdue 0~7일: 부드러운 알림 1회/주
- overdue 8~21일: 알림 빈도 낮춤(과부하 방지)
- overdue 22일 이상: 홈 배너로만 노출(푸시 강요 X)
