# Check-in Feature Blueprint

이 폴더는 MindLab 서비스의 daily check-in 기능 최신 blueprint다.

## 목적
check-in은 사용자가 로컬 날짜 기준으로 처음 로그인했을 때 보게 되는 일일 입력이다.
이 입력은 다음에 사용된다.
- 현재 상태(nowcast) 예측
- 7일 / 28일 trend metric 계산
- challenge recommendation 입력
- sparse assessment 보정 전 상태 추정

## 포함 범위
- 총 수면시간
- 기상시간
- 잠들기까지 걸린 시간
- 기분
- 불안/스트레스
- 에너지
- 햇빛 노출
- 운동
- 음주
- 오후 2시 이후 카페인

## 제외 범위
- 외출
- CBT direct inputs
- 자유일기 / 자유서술
- challenge 수행 여부 입력

## 핵심 원칙
- 입력은 짧고 구조화되어야 한다.
- raw 입력과 derived feature를 분리 저장한다.
- 현재 상태 예측에 same-day check-in을 사용할 수 있다.
- irregular access를 고려해 7일 / 28일 missingness feature를 함께 만든다.
