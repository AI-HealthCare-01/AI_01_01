# CBT Flow Spec (v3.1)

## 목적
- 기존 채팅 레이아웃(타임라인 + 하단 입력)을 유지한 상태에서, CBT 대화 흐름만 상태기계로 운영합니다.
- CBT는 인지 재구성(Thought Record)만 수행합니다.
- 호흡/그라운딩/주간 돌아보기는 CBT 내부 기능으로 구현하지 않고 필요 시 링크만 제공합니다.

## 단계(6단계 고정)
1. `situation` (상황)
2. `emotion` (감정 라벨 + 강도)
3. `thought` (순간 떠오른 생각 + 핵심 메시지 유도)
4. `evidence` (맞아 보이는 이유 / 꼭 그렇지 않을 수 있는 이유)
5. `alternative_plan` (새 생각 + 약속)
6. `summary` (요약/저장)

상단 단계 UI는 서버 응답값 `phase_key`, `phase_index`, `subphase_key`를 기준으로만 이동합니다.

## 대화 턴 규칙
- 매 사용자 입력마다 assistant 메시지는 최소 2턴으로 구성합니다.
  - 1턴: 공감/재진술
  - 2턴: 다음 질문 또는 다음 입력 안내
- 메시지 톤은 해요체로 통일합니다.
- 전문 용어는 사용자 문구에서 일상어로 치환합니다.

## Quick Reply 정책
- quick reply는 입력창 위 `QuickReplyBar`에서만 노출합니다.
- `prefill`: 입력창 채우기만 수행(자동 전송 금지)
- `action`: 즉시 실행
- 숫자 강도 버튼 외 prefill은 기본적으로 `": "` 형태를 사용합니다.
- 단계별 세트는 `/docs/cbt_quick_reply_registry.md`를 단일 기준으로 사용합니다.

## 핵심 메시지(core message) 유도
- `thought/auto_thought` 입력 후 핵심 메시지가 부족하면 `core_probe`로 진입합니다.
- probe는 최대 2회, 언제든 skip 가능.
- core가 확정되면 evidence 이전에 1회 요약 확인 메시지를 제공합니다.

## Skip/Repair 정책
- `situation`은 hard-required: skip으로 다음 단계로 넘어갈 수 없습니다.
- 맥락 이탈/무효 입력 시 즉시 종료 대신 복구 메시지를 먼저 제공합니다.
- 기본 복구 선택지: `다시 답하기`, `주제 다시`, `종료`
- 동일 단계 반복 실패가 누적되면 요약 단계로 안전 종료할 수 있습니다.

## TO DO 연동
- 약속 확정 시 `commitment_text`/`commitment_type`을 state에 저장합니다.
- 세션 저장 시 TO DO는 사용자 선택 UI 없이 state 기반으로 자동 생성됩니다.
- 회고 완료 시 TO DO pending 목록에서 제거되고, 회고 내용이 세션 state에 append 저장됩니다.

## 금지/제약
- CBT 화면에서 `체크인` 용어 사용 금지 (`오늘 기록`만 사용)
- CBT 시작에서 기분 재수집 금지 (오늘 기록 참조만 허용)
- UI에서 `[버튼]` 같은 텍스트 버튼 표현 금지
