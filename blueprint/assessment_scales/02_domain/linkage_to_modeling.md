# 다른 기능(모델/대시보드/요약리포트) 연동

## 모델(nowcast) 입력으로 쓰는 방식(권장)
- 설문은 sparse anchor:
  - phq9_last_score, gad7_last_score, isi_last_score
  - days_since_last_phq9, ...
  - assessment_overdue_flag

## daily_state 앵커로 변환(선택)
- PHQ-9/GAD-7/ISI 총점을 0~100로 정규화하여 anchor로 사용(예: score/max*100)
- anchor는 '측정치'로서 EMA/Kalman 업데이트에 사용 가능
- 단, 설문은 지난 2주를 반영하므로, 상태 필터에서는 측정 분산을 크게 두는 것이 안정적

## 대시보드/요약리포트
- 검사일 marker(점) + 점수 추세 라인
- 기간 내 설문 없으면 최근 설문 + 경과일 표시
