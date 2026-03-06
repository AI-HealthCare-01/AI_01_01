# Overview

Check-in은 현재 상태(nowcast) 모델의 가장 직접적인 관측 입력이다.
서비스는 사용자가 매일 규칙적으로 접속하지 않아도 동작해야 하므로,
check-in 데이터 구조는 다음을 동시에 만족해야 한다.

1. same-day current state estimation
2. sparse / missing check-in 처리
3. 7일 / 28일 trend calculation
4. challenge recommendation input
5. periodic assessment anchor와의 결합
