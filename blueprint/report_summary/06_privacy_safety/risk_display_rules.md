# 위험 플래그 표시 규칙

## 원칙
- 구조화된 위험 신호만 표시(cbt_risk_signal).
- LLM 추론(핵심믿음/왜곡 라벨링 등)은 리포트 기본 출력에서 제외.
- 표시 시 '자기보고/구조화 질문 기반'임을 명확히.

## 표시 형태
- 기간 내 최고 위험 수준(suicide_risk_max_level 0~3)
- 이벤트가 있으면 날짜 + source만 표시
- 상세 문장/원문 대화는 포함하지 않음

## 조건부 강조
- suicide_risk_max_level >= 2 또는 self_harm_any=true면 상단 요약카드에 경고 박스 추가
