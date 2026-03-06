# Codex 시작 프롬프트 (진단척도 검사)

이 레포에 `blueprint/assessment_scales/`가 있다. 아래 기능을 구현하라.

목표:
- PHQ-9 / GAD-7 / ISI 설문 수행(섹션명은 부드럽게)
- 결과 요약/상세 화면(점수+그래프+비진단형 설명)
- 28일 권장 주기지만, 사용자는 불규칙하게 수행할 수 있음(스케줄/완료 상태 저장)

제약:
1) 문항/응답 기준은 검증판을 사용한다. 임의로 재작성하지 말 것.
2) 결과 설명은 진단 문구 금지. '자기보고 요약'으로만.
3) 저장 구조는 schema.sql을 따른다.
4) PHQ-9 위험 문항이 0이 아니면 안전 안내 화면을 조건부로 보여준다(109/119/112).

API:
- POST /v1/assessments/start
- POST /v1/assessments/{id}/answer
- POST /v1/assessments/{id}/complete
- GET  /v1/assessments/history

프론트:
- 시작 화면, 문항 화면, 결과 요약, 결과 상세, 안전 안내(조건부)
- 응답은 버튼(점수+설명). PHQ-9/GAD-7은 공통 0~3, ISI는 item별 옵션 로딩.

제출:
- 구현 코드 + 실행 방법 README 업데이트
