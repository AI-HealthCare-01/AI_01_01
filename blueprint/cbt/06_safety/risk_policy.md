# Risk policy

## Risk levels
- 0: 일반 지원 가능
- 1: 주의 모니터링
- 2: safety-first, 일반 개입 축소
- 3: 위기 대응 우선

## Output rule
- risk_level >= 2 이면 일반 recommendation보다 safety flow 우선
- risk_level >= 3 이면 challenge recommendation 억제
- risk flags는 current-state model feature로는 요약값만 사용
