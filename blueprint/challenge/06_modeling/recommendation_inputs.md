# Recommendation inputs

## 현재 상태 모델 입력과 연결되는 challenge 관련 변수
- challenge_shown_count_7d / 28d
- challenge_accept_count_7d / 28d
- active_challenge_count_today
- challenge_completion_rate_7d / 28d
- challenge_helpfulness_mean_28d
- challenge_dropout_count_28d
- domain active flags

## 현재 상태 예측 타깃과의 관계
challenge 데이터는 현재 상태의 보조 입력이다.
challenge feature importance는 설명용일 뿐, 인과 효과를 단정하지 않는다.

## post-launch 고도화
real data가 쌓이면
- exposure -> accept
- accept -> complete
- complete -> state change
를 분리해 uplift / response modeling으로 확장한다.
