# CBT Thought Record Flow Spec (v2)

## 1) Scope
- CBT 채팅은 기존 레이아웃(타임라인 + 하단 입력/버튼 + 우측 TO DO/체크포인트)을 유지한다.
- 이번 버전은 **인지 재구성 대화(Thought Record)**만 수행한다.
- 호흡/감각 안정/그라운딩/주간 그래프 리플렉션은 CBT 내부 모듈에서 제거하고, 필요 시 링크만 제공한다.

## 2) 용어/표현 규칙
- CBT 화면/메시지/버튼에서 `체크인` 단어 사용 금지.
- 사용자 노출 문구는 `오늘 기록`, `오늘 상태 기록`으로 표기한다.
- 기술 용어(자동적 사고/인지왜곡/반박근거 등)는 화면에서 직접 노출하지 않고 일상어로 변환한다.

## 3) Session Start Rule
- CBT 시작 시 기분 재수집 금지.
- 서버는 `오늘 기록`(daily checkin) 존재 여부와 핵심 필드를 조회해 세션 컨텍스트에 붙인다.
- 오늘 기록이 없으면 첫 assistant 메시지에 안내 + `오늘 기록으로 이동` 액션을 제공하되,
  사용자가 원하면 그대로 CBT 대화를 계속 진행 가능해야 한다.
- 첫 질문은 무드 질문이 아니라 상황 질문으로 시작한다.

## 4) State Machine

### 4.1 Public stages (UI 동기화)
1. `situation` (상황)
2. `emotion` (그 상황에서의 감정 + 세기 0~100)
3. `thought` (순간 떠오른 생각)
4. `evidence` (맞다고 느낀 이유 + 다르게 볼 이유)
5. `alternative_plan` (균형 생각 + 작은 약속)
6. `summary` (요약/저장/TO DO 안내)

### 4.2 Internal substates
- `evidence_for`
- `evidence_against`
- Evidence 단계는 상단 진행 UI에서 1개로 유지하고, 메시지에서만 `Evidence 1/2`, `Evidence 2/2` 보조 표시.

### 4.3 Turn contract
모든 사용자 입력 처리마다 assistant는 타임라인에 아래 두 턴을 남긴다.
1. 공감/재진술 1~2문장
2. 다음 질문 또는 선택형 입력 안내 1문장

## 5) Fallback / Loop prevention
- 단계 입력이 무관/장문/이탈인 경우:
  1. 공감 1문장
  2. 현재 단계 재안내 1문장
  3. 선택지 3개 제공:
     - 이 질문에 다시 답하기
     - 이 단계 건너뛰기
     - 주제 다시 선택하기
- `모르겠어요/건너뛰기`는 정상 흐름으로 취급.
- 동일 단계 실패 3회 반복 시 강제 탈출:
  - `주제 다시 선택` 또는
  - `세션 종료(TO DO 없이 요약)`.

## 6) Safety gate
- 각 턴마다 규칙 기반 + LLM 보조 분류로 위험 신호 평가.
- 위험 레벨 >= 2:
  - 일반 CBT 단계 진행 중단
  - 즉시 안전 안내 메시지/화면
  - 위험 이벤트 DB 저장
  - 관리자 알림 큐(존재 시) 이벤트 생성

## 7) LLM usage boundary
LLM은 아래 3개 목적에만 사용한다.
1. extractor: 사용자 입력 -> 구조화 필드 추출(JSON)
2. response_composer: 공감/재진술/다음 질문 생성(JSON)
3. risk_classifier: 위험 신호 보조 분류(JSON)

제약:
- 자유상담가 모드 금지
- JSON schema 강제 + 서버 검증
- 실패 시 템플릿 fallback 사용
- 사용자 입력에 없는 사실 생성 금지

## 8) Storage model

### 8.1 Session payload (누적)
- `situation_text`
- `emotion_label`
- `emotion_intensity_0_100`
- `auto_thought_text`
- `evidence_for[]`
- `evidence_against[]`
- `alternative_thought`
- `commitment_type` (`behavior` | `thought_practice`)
- `commitment_text`
- `todo_id`
- `summary_text`

### 8.2 Reflection append
회고 제출 시 세션에 append:
- `reflection_status` (`done` | `declined`)
- `reflection_note` or `reason`
- `reflection_at`

### 8.3 Turn diagnostics (내부 로그)
- `llm_used`
- `llm_model`
- `llm_latency_ms`
- `fallback_reason`
- `state_repeat_count`

## 9) TO DO / Reflection linkage
- CBT에서 약속 확정 시 TO DO 생성.
- TO DO가 없으면 세션은 `TO DO: 정하지 않음`으로 저장.
- TO DO 화면에서 수행함/수행 원하지 않음 제출 시:
  - pending TO DO 목록에서 제거
  - 해당 CBT 세션에 회고 append 저장
- CBT 채팅 안에 별도 회고 UI는 만들지 않는다(기존 회고 화면 재사용).

## 10) Display-name rule
- assistant 표시명: `session.profile_snapshot.coach_nickname` (fallback `마음코치`)
- user 표시명: 사용자 닉네임 (fallback `나`)
- 금지: `assistant/bot/system`, 이메일/uid 표시

## 11) Out-of-scope
- 디자인 토큰/컬러/글래스 효과 변경
- CBT 외 기능의 구조 변경

## 12) Acceptance checklist
- [ ] CBT는 기존 채팅 화면 1곳에서만 진행
- [ ] CBT UI에서 `체크인` 용어 0회
- [ ] 첫 질문은 상황 질문이며 기분 재수집 없음
- [ ] 단계 UI와 state machine 상태값 1:1 동기화
- [ ] 이상 입력 폴백 + 3회 반복 탈출 동작
- [ ] TO DO 생성/회고 완료 시 세션 append + pending 목록 제거
- [ ] 위험 레벨 2+ 시 safety-first 전환
