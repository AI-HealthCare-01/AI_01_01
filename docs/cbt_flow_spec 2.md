# CBT Flow Spec (최종)

## 1. 범위
- CBT는 기존 채팅 레이아웃(타임라인 + 하단 입력)을 유지한다.
- 이번 플로우는 **인지 재구성(Thought Record)**만 수행한다.
- 호흡/그라운딩/감각 안정, 주간 돌아보기는 CBT 내부 구현 대상이 아니며 필요 시 링크만 제공한다.

## 2. 시작 규칙
- CBT 시작 시 기분을 다시 수집하지 않는다.
- 서버는 오늘 기록(있다면)만 참조해 컨텍스트를 만든다.
- 오늘 기록이 없어도 CBT는 진행 가능하며, `오늘 기록으로 이동` 버튼을 선택적으로 제공한다.
- 첫 질문은 항상 상황 질문으로 시작한다.

## 3. 단계(6단계 고정)
1. `situation` : 지금 다룰 상황 한 줄 정리
2. `emotion` : 그 상황의 감정 라벨 + 감정 세기(0~100)
3. `thought` : 순간 떠오른 생각 + 핵심 메시지 유도
4. `evidence` : 맞아 보이는 이유 / 꼭 그렇지 않을 수 있는 이유
5. `alternative_plan` : 균형 잡힌 생각 + 작은 약속(행동 또는 생각 연습)
6. `summary` : 요약 및 저장 안내(TO DO 확정)

상단 단계 UI는 서버 응답의 `phase_key`, `phase_index`만으로 동기화한다.

## 4. Quick Reply 정책
- Quick Reply는 입력창 위 가로 버튼 바로 제공한다.
- 메시지 본문에 `[버튼]` 같은 텍스트를 출력하지 않는다.
- 감정 라벨 선택은 반드시 Quick Reply로 제공한다.
- 각 단계 기본 버튼:
  - 상황: 학업/일, 인간관계, 건강/컨디션, 기타
  - 감정: 불안, 서운함, 분노, 슬픔, 부담, 무기력, 기타(직접 입력), 건너뛰기
  - 감정 세기: 30, 50, 70, 90, 직접 입력, 건너뛰기
  - 생각 심화: 실패할 거예요, 무가치해요, 미움받을 거예요, 혼자 남을 거예요, 통제 못해요, 직접 입력, 건너뛰기
  - 요약: 세션 저장하기, 주제 다시 선택하기

## 5. 생각 단계 심화 규칙
- `auto_thought_text`를 먼저 저장한다.
- 충분히 핵심적인 문장으로 판단되지 않으면 꼬리질문으로 핵심 메시지를 유도한다.
- 꼬리질문은 최대 2회.
- 언제든 `건너뛰기` 가능.
- 저장 필드:
  - `auto_thought_text`
  - `core_message_text` (없으면 `null` 또는 빈 값)

## 6. 턴 처리 규칙
매 사용자 입력마다 assistant는 반드시 2개의 메시지를 남긴다.
1. 공감/재진술 1~2문장
2. 다음 질문 또는 선택 유도

입력 실패/이탈 시 폴백:
- 공감 1문장 + 현재 단계 재안내 1문장
- 버튼 3개: 다시 답하기 / 이 단계 건너뛰기 / 주제 다시 선택하기
- 동일 단계 실패 3회면 요약 단계로 강제 이탈(루프 방지)

## 7. 안전 규칙
- 위험 분류는 규칙 기반 + LLM 보조 분류를 함께 사용한다.
- 위험 레벨 2 이상이면 CBT 단계를 중단하고 안전 안내를 우선한다.
- 안전 이벤트는 세션/위험 신호로 저장한다.

## 8. LLM 사용 제한
LLM 목적은 아래로 제한한다.
1. extractor: 구조화 필드 추출(JSON)
2. response_composer: 짧은 공감/재진술/다음 질문 생성(JSON)
3. risk_classifier: 위험 신호 보조 분류(JSON)

제약:
- 사용자 입력에 없는 사실 생성 금지
- JSON 스키마 검증 실패 시 템플릿 fallback

## 9. 문구/톤 규칙
- 코치 메시지 표시명: 세션의 `profile_snapshot.coach_nickname` (없으면 `마음코치`)
- 사용자 표시명: 사용자 닉네임 (없으면 `나`)
- 코치 말투: 해요체 통일
- 용어 치환(사용자 노출):
  - 자동적 사고 → 순간 떠오른 생각
  - 인지왜곡 → 생각이 한쪽으로 기울어진 패턴
  - 근거/반증 → 맞아 보이는 이유 / 꼭 그렇지 않을 수 있는 이유
  - 대안적 사고 → 좀 더 균형 잡힌 생각
- CBT 화면에서 `체크인` 용어 사용 금지, `오늘 기록`으로만 표기

## 10. 저장 스키마(세션 state)
- `situation_text`
- `emotion_label`, `emotion_intensity_0_100`
- `auto_thought_text`, `core_message_text`
- `evidence_for[]`, `evidence_against[]`
- `alternative_thought`
- `commitment_type`, `commitment_text`
- `todo_id`
- `summary_text`
- `turn_diagnostics[]` (`llm_used`, `llm_model`, `llm_latency_ms`, `fallback_reason`, `state_repeat_count`, `phase_key`)

회고 완료 append:
- `reflection_status(done|declined)`
- `reflection_note/reason`
- `reflection_at`

## 11. TO DO/회고 연동
- 약속이 확정되면 TO DO 생성 및 세션 state에 `todo_id` 저장
- 회고 완료 시:
  - TO DO pending 목록에서 제거
  - 해당 CBT 세션에 회고 내용 append 저장
- CBT 채팅 안에 별도 회고 UI는 만들지 않는다(기존 회고 화면 재사용)
