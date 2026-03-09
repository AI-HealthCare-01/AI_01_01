# CBT Quick Reply Registry (v5)

CBT quick reply는 `phase_key + subphase_key` 기준으로 서버가 생성하고, 프론트는 그대로 렌더링합니다.

## 공통 규칙
- `prefill`: 입력창 채우기만 수행(자동 전송 금지)
- `action`: 즉시 실행
- 숫자 강도 버튼(`30/50/70/90`) 외 prefill은 기본 `: ` 형식
- `직접입력` 전용 버튼은 두지 않음(사용자는 키보드로 언제든 입력 가능)
- CBT 대화/버튼 문구에 `체크인` 사용 금지

## 단계별 버튼 세트

### 1) `situation/topic`
- prefill: `학업/일`, `인간관계`, `컨디션`, `기타`
- action: `skip_stage`, `reset_topic`, `end_session`
- 정책: hard-required 단계라서 skip 시 다음 단계로 가지 않고 복구 분기

### 2) `emotion/label`
- prefill: `불안`, `서운함`, `분노`, `슬픔`, `부담`, `무기력`, `기타`
- action: `skip_stage`, `reset_topic`, `end_session`

### 3) `emotion/intensity`
- prefill: `30`, `50`, `70`, `90` (숫자만)
- action: `skip_stage`, `reset_topic`, `end_session`

### 4) `thought/auto_thought`
- prefill: `떠오른 생각`, `머릿속 한마디`, `결론처럼 느껴진 말`, `걱정 한 줄`
- action: `skip_stage`, `reset_topic`, `end_session`

### 5) `thought/core_probe`
- prefill: `무능해 보일까 봐`, `미움받을까 봐`, `버려질까 봐`, `실패할까 봐`, `통제 못 할까 봐`, `기타`
- action: `skip_stage`, `reset_topic`, `end_session`
- 정책: 최대 2회 질문 후 `core_blocked`로 이동 가능

### 6) `thought/core_confirm`
- action:
  - `confirm_core_yes` (맞아요)
  - `confirm_core_no` (조금 달라요)
  - `confirm_core_not_sure` (잘 모르겠어요)
  - `reset_topic`
  - `end_session`

### 7) `thought/core_refine`
- prefill: `core_thought_candidates` 기반 후보(2~3개, 없으면 기본 후보)
- action: `retry_stage`, `reset_topic`, `end_session`

### 8) `thought/core_blocked`
- action: `retry_stage`, `reset_topic`, `end_session`

### 9) `evidence/evidence_for`
- prefill: `관찰한 사실`, `내 경험`, `누가 한 말/메시지`, `내 행동/반응`, `몸의 반응(신체)`
- action: `skip_stage`, `next_stage`, `reset_topic`, `end_session`
- 엄격 분리: `evidence_against` 전용 항목 혼합 금지

### 10) `evidence/evidence_against`
- prefill: `예외였던 순간`, `다른 가능성`, `확인되지 않은 부분`, `타인의 피드백/반응`, `나아졌던 경험`
- action: `skip_stage`, `next_stage`, `reset_topic`, `end_session`
- 엄격 분리: `evidence_for` 전용 항목 혼합 금지

### 11) `alternative_plan/alternative`
- prefill: 컨텍스트 기반 후보 2~3개 + `직접 다듬기`
- action: `skip_stage`, `reset_topic`, `end_session`
- 후보 문장은 완성형이라 콜론 강제 안 함

### 12) `alternative_plan/commitment`
- action:
  - `choose_action_commitment`
  - `choose_thought_practice`
  - `finish_without_todo`
  - `reset_topic`
  - `end_session`

### 13) `alternative_plan/commitment_action`
- prefill: LLM/패턴 기반 행동 약속 후보 2~3개
- action: `skip_stage`, `reset_topic`, `end_session`

### 14) `alternative_plan/commitment_thought`
- prefill: LLM/패턴 기반 생각 연습 약속 후보 2~3개
- action: `skip_stage`, `reset_topic`, `end_session`

### 15) `summary/summary`
- action: `reset_topic`, `end_session`

### 16) fallback
- `fallback/general`: `retry_stage`, `reset_topic`, `end_session`
- `fallback/hard_required`: `retry_stage`, `reset_topic`, `end_session`

## 복구(Repair) 정책
- 맥락 이탈/무효 입력 시 즉시 종료 대신 복구 메시지를 먼저 제공합니다.
- 기본 선택지는 항상 `다시 답하기`, `주제 다시`, `종료`를 포함합니다.
- 동일 단계 반복 실패가 누적되면 요약 단계 안전 종료를 허용합니다.
