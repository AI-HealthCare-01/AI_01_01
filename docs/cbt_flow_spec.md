# CBT Flow Spec (v5)

## 목적
- CBT는 기존 채팅 레이아웃(타임라인 + 하단 입력창)을 유지한 채 상태기계로 운영합니다.
- 기능 범위는 인지 재구성(Thought Record)만 포함합니다.
- 호흡/그라운딩/주간 돌아보기는 CBT 내부에서 직접 수행하지 않고 필요 시 링크만 제공합니다.

## 고정 단계(6단계)
1. `situation` : 지금 다룰 상황 한 줄
2. `emotion` : 그 상황의 감정 라벨 + 강도(0~100)
3. `thought` : 순간 떠오른 생각 → 핵심생각 정교화 → 확인
4. `evidence` : 맞아 보이는 이유(`evidence_for`) / 꼭 그렇지 않을 수 있는 이유(`evidence_against`)
5. `alternative_plan` : 균형 생각 + 약속(행동 또는 생각 연습)
6. `summary` : 요약/저장/마무리

진행 단계 UI는 서버의 `phase_key`, `subphase_key`, `phase_index`와 1:1 동기화합니다.

## 핵심생각 정교화(Thought v5)
- `auto_thought` 입력 후 LLM 분석으로 아래를 생성합니다.
  - `core_thought_candidates`(2~3개)
  - `best_core_thought`(핵심생각 1개)
  - `pattern_ranked`(내부 생각패턴 추정)
  - `pattern_probe_question`(라벨 노출 없이 부드러운 확인 질문)
- 근거 단계로 넘어가기 전에 `core_confirm` 단계를 반드시 거칩니다.
  - 코치 요약 + 패턴 예시 질문 + 확인 질문
  - action: `confirm_core_yes`, `confirm_core_no`, `confirm_core_not_sure`
- `no/not_sure`면 `core_refine`으로 이동하여 후보 prefill 기반으로 재정리합니다.

## LLM 관여 범위
- `extract_fields`: 단계별 구조화 추출(JSON)
- `analyze_core_pattern`: 핵심생각 + 내부 생각패턴 분석(JSON)
- `compose_response`: 공감/재진술/다음 질문 생성(JSON)
- `suggest_alternative_candidates`: 새 생각 후보 추천(JSON)
- `suggest_commitment_candidates`: 약속 후보 추천(JSON)
- `compose_repair_message`: 맥락 이탈 복구 문장(JSON)
- `classify_risk`: 위험 보조 분류(JSON)

모든 LLM 응답은 JSON 파싱 실패 시 규칙 기반 fallback으로 대체합니다.

## 대화 메시지 규칙
- 매 사용자 입력마다 assistant는 최소 2개 메시지를 반환합니다.
  - 공감/정리
  - 다음 질문/입력 유도
- 코치 문체는 해요체로 통일합니다.
- 전문용어는 사용자 노출 문구에서 일상 표현으로 치환합니다.
- 동일/유사 메시지 반복 방지:
  - 서버 중복 문장 제거
  - 최근 assistant 히스토리 유사도 차단
  - 비문(`되죠요` 등) 후처리 정규화

## Quick Reply 정책
- `prefill`: 입력창에 텍스트만 채우고 전송하지 않습니다.
- `action`: 즉시 이벤트로 처리합니다.
- 숫자 강도 버튼을 제외한 prefill은 기본 `: ` 형태를 사용합니다.
- 단계별 버튼 세트는 `docs/cbt_quick_reply_registry.md`를 단일 기준으로 사용합니다.

## Skip / Repair / 루프 방지
- `situation`은 hard-required이며 skip으로 다음 단계 이동 불가입니다.
- 입력이 비어있거나 맥락 이탈이면 Repair 메시지를 먼저 제공합니다.
  - action: `retry_stage`, `reset_topic`, `end_session`
- 동일 단계 실패 카운트가 3회 이상이면 요약 단계로 안전 종료할 수 있습니다.

## TO DO / 회고 연동
- `alternative_plan`에서 약속 텍스트가 확정되면 `commitment_text`와 `commitment_type`이 state에 저장됩니다.
- 세션 저장 시 TO DO는 state 기반으로 자동 생성됩니다(수동 선택 UI 없음).
- 회고 완료 시 TO DO pending 목록에서 제거되고, 회고 내용이 세션 요약에 append 저장됩니다.

## 용어/제약
- CBT 화면에서는 `체크인`이라는 단어를 사용하지 않습니다. `오늘 기록`만 허용합니다.
- CBT 시작 시 기분을 재수집하지 않고 오늘 기록을 참조만 합니다.
- UI에 `[버튼]` 같은 텍스트형 가짜 버튼을 표시하지 않습니다.
