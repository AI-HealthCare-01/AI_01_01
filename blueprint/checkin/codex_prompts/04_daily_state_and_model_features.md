이 기능은 current-state nowcast 모델의 핵심 관측치다.
구현 시 다음을 보장하라.

1. raw 입력 저장과 derived feature 저장을 분리
2. same-day today fields 생성
3. 7d / 28d rolling mean, std, missing count 생성
4. `days_since_prev_checkin` 생성
5. periodic_assessment와 조인 가능한 키 유지
6. challenge recommendation이 읽을 수 있는 feature view 생성
