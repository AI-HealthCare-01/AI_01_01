# CBT Quick Reply Registry

이 문서는 CBT 상태기계에서 사용하는 Quick Reply 세트를 `phase_key` / `subphase_key` 기준으로 정의한 단일 기준 문서입니다.

## 공통 규칙
- `type=prefill`: 입력창에 `fill_text`를 채우기만 하고 즉시 전송하지 않음
- `type=action`: 즉시 서버 이벤트로 전송
- `직접입력` 버튼은 제공하지 않음
- `기타`는 유지하며 항상 `fill_text="기타: "`로 prefill
- UI는 서버 응답 `quick_replies`만 렌더링하고 프론트에서 임의 병합/변형하지 않음

## Registry

### 1) situation / topic
- prefill: `학업/일`, `인간관계`, `건강/컨디션`, `기타`(`기타: `)
- action: `주제 다시`(`reset_topic`), `종료`(`end_session`)
- 비고: `situation` 단계는 hard-required. `skip_stage` 불가

### 2) emotion / label
- prefill: `불안`, `서운함`, `분노`, `슬픔`, `부담`, `무기력`, `기타`(`기타: `)
- action: `건너뛰기`(`skip_stage`)

### 3) emotion / intensity
- prefill: `30`, `50`, `70`, `90`
- action: `건너뛰기`(`skip_stage`)

### 4) thought / auto_thought
- prefill: `나는 또 실패할 거예요`, `상대가 나를 싫어할 거예요`, `나는 부족한 사람 같아요`, `기타`(`기타: `)
- action: `건너뛰기`(`skip_stage`)
- 비고: skip 시 `thought/core_probe`로 이동

### 5) thought / core_probe
- prefill: `실패할 거예요`, `무가치해요`, `미움받을 거예요`, `혼자 남을 거예요`, `통제 못해요`, `기타`(`기타: `)
- action: `건너뛰기`(`skip_stage`)
- 비고: core probe는 최대 2회

### 6) thought / core_blocked
- action: `주제 다시`(`reset_topic`), `종료`(`end_session`)
- 비고: core 단계까지 skip한 경우 도달

### 7) evidence / evidence_for
- prefill: `실제 지적을 받았어요`, `일이 늦어지고 있어요`, `상대 표정이 굳어 보였어요`, `몸이 굳고 심장이 빨라졌어요`, `기타`(`기타: `)
- action: `건너뛰기`(`skip_stage`)
- 엄격 분리: against 전용 항목 노출 금지

### 8) evidence / evidence_against
- prefill: `예전에 비슷한 일을 해결한 적이 있어요`, `도와주는 사람이 있어요`, `한 번의 결과가 전부는 아니에요`, `지금 정보만으로 단정하기 어려워요`, `기타`(`기타: `)
- action: `건너뛰기`(`skip_stage`)
- 엄격 분리: for 전용 항목 노출 금지

### 9) alternative_plan / alternative
- prefill: `지금 어렵지만 모든 게 끝난 건 아니에요`, `실수가 있어도 내 가치가 사라지는 건 아니에요`, `한 번에 단정하지 않고 다음 행동을 해볼게요`, `기타`(`기타: `)
- action: `건너뛰기`(`skip_stage`)

### 10) alternative_plan / commitment
- prefill: `저녁 8시에 10분 산책하기`, `잠들기 전 5분 정리 메모`, `내일 아침 할 일 1개만 적기`, `이번에는 정하지 않기`, `기타`(`기타: `)
- action: `건너뛰기`(`skip_stage`)

### 11) summary / summary
- action: `주제 다시`(`reset_topic`), `종료`(`end_session`)

### 12) fallback / general
- action: `다시 답하기`(`retry_stage`), `이 단계 건너뛰기`(`skip_stage`), `주제 다시`(`reset_topic`)

### 13) fallback / hard_required
- action: `주제 다시`(`reset_topic`), `종료`(`end_session`)

## Skip 정책 요약
- `situation`: skip 불가 (`hard_required`)
- `thought/auto_thought`: skip 시 `core_probe` 이동
- `thought/core_probe`: skip 시 `core_blocked` 이동 (`reset/end`만 허용)
- `emotion`, `evidence`: soft-required (건너뛰기 허용)
