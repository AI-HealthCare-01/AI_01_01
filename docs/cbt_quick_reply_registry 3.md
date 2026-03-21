# CBT Quick Reply Registry (v3.1)

CBT quick reply는 `phase_key` + `subphase_key`를 기준으로 서버가 생성하고, 프론트는 그대로 렌더링합니다.

## 공통 규칙
- `type=prefill`: 입력창에 `fill_text`만 채우고 전송하지 않습니다.
- `type=action`: 즉시 서버 이벤트로 전송합니다.
- 숫자 강도 버튼(`30/50/70/90`)을 제외한 prefill은 기본 `": "` 형태를 유지합니다.
- `직접입력` 버튼은 별도로 두지 않습니다. 사용자는 항상 직접 입력할 수 있습니다.
- CBT 대화/버튼에서 `체크인` 용어를 쓰지 않습니다.

## 단계별 세트

### 1) `situation/topic`
- prefill: `학업/일`, `인간관계`, `컨디션`, `기타`
- action: `건너뛰기(skip_stage)`, `주제 다시(reset_topic)`, `종료(end_session)`
- 정책: `situation`은 hard-required라서 `건너뛰기`를 눌러도 다음 단계로 넘어가지 않고 복구 선택지로 안내합니다.

### 2) `emotion/label`
- prefill: `불안`, `서운함`, `분노`, `슬픔`, `부담`, `무기력`, `기타`
- action: `건너뛰기`, `주제 다시`, `종료`

### 3) `emotion/intensity`
- prefill: `30`, `50`, `70`, `90` (숫자만)
- action: `건너뛰기`, `주제 다시`, `종료`

### 4) `thought/auto_thought`
- prefill: `떠오른 생각`, `머릿속 한마디`, `결론처럼 느껴진 말`, `걱정 한 줄`
- action: `건너뛰기`, `주제 다시`, `종료`

### 5) `thought/core_probe`
- prefill: `무능해 보일까 봐`, `미움받을까 봐`, `버려질까 봐`, `실패할까 봐`, `통제 못 할까 봐`, `기타`
- action: `건너뛰기`, `주제 다시`, `종료`
- 정책: core probe는 최대 2회, 이후 `core_blocked`로 전환됩니다.

### 6) `thought/core_blocked`
- action: `다시 답하기(retry_stage)`, `주제 다시(reset_topic)`, `종료(end_session)`

### 7) `evidence/evidence_for`
- prefill: `관찰한 사실`, `내 경험`, `누가 한 말/메시지`, `내 행동/반응`, `몸의 반응(신체)`
- action: `건너뛰기`, `다음으로(next_stage)`, `주제 다시`, `종료`
- 엄격 분리: `evidence_against` 전용 라벨이 섞이면 안 됩니다.

### 8) `evidence/evidence_against`
- prefill: `예외였던 순간`, `다른 가능성`, `확인되지 않은 부분`, `타인의 피드백/반응`, `나아졌던 경험`
- action: `건너뛰기`, `다음으로(next_stage)`, `주제 다시`, `종료`
- 엄격 분리: `evidence_for` 전용 라벨이 섞이면 안 됩니다.

### 9) `alternative_plan/alternative`
- prefill: 대화 컨텍스트 기반 후보 3개 + `직접 다듬기`
- action: `건너뛰기`, `주제 다시`, `종료`
- 정책: 후보 문장은 완성형이므로 콜론을 강제하지 않습니다.

### 10) `alternative_plan/commitment`
- action:
  - `행동으로 정하기(choose_action_commitment)`
  - `생각 연습으로 정하기(choose_thought_practice)`
  - `이번에는 TO DO 없이 마무리(finish_without_todo)`
  - `주제 다시`, `종료`

### 11) `alternative_plan/commitment_action`
- prefill: `10분만 준비/정리하기`, `확인 메시지 1줄 보내기`, `5분만 시작하기`
- action: `건너뛰기`, `주제 다시`, `종료`

### 12) `alternative_plan/commitment_thought`
- prefill: `예외 1개 찾기`, `반대 근거 1개 추가`, `'항상/절대' 표현 줄이기`
- action: `건너뛰기`, `주제 다시`, `종료`

### 13) `summary/summary`
- action: `주제 다시`, `종료`

### 14) fallback
- `fallback/general`: `다시 답하기`, `주제 다시`, `종료`
- `fallback/hard_required`: `다시 답하기`, `주제 다시`, `종료`

## 복구(Repair) 정책 요약
- 맥락 이탈/빈 입력/하드 필수값 누락 시 먼저 완곡한 복구 메시지를 제시합니다.
- 즉시 종료 강요 없이 `다시 답하기`를 우선 노출합니다.
- 동일 단계 실패가 누적되면(`3회`) 요약 단계로 안전 종료할 수 있게 전환합니다.
