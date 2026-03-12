# CBT Patch Audit (누락 반영 점검)

## 점검 범위
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/web/src/features/cbt/session-screen.tsx`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/web/src/features/core-inputs/api-client.ts`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/web/src/features/core-inputs/types.ts`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/api/app/insights/cbt/engine.py`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/api/app/insights/store.py`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/api/app/insights/models.py`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/api/app/insights/router.py`

## 누락 반영 진단표
| 요구사항 | 수정 전 상태 | 원인 | 수정 파일 | 수정 후 동작 |
|---|---|---|---|---|
| 코치 말투 100% 해요체 | LLM/템플릿 문장이 존댓말/반말 혼용 가능 | 코치 문장 후처리 강제 규칙 부족 | `apps/api/app/insights/cbt/engine.py` | 코치 메시지 후처리에서 용어 치환 + 종결어미 보정(해요체) 적용 |
| 감정 라벨 버튼 선택 | 감정 입력이 자유 텍스트 중심 | 감정 단계 quick replies 미연동 | `apps/api/app/insights/cbt/engine.py`, `apps/web/src/features/cbt/session-screen.tsx` | 감정 단계에서 QuickReplyBar(불안/서운함/분노/슬픔/부담/무기력/기타/건너뛰기) 강제 제공 |
| 단계 UI 6단계 동기화 | 프론트 로컬 추정/구형 stage 혼합 | 서버 phase 값 미사용 | `apps/api/app/insights/models.py`, `apps/api/app/insights/cbt/engine.py`, `apps/api/app/insights/store.py`, `apps/web/src/features/cbt/session-screen.tsx` | 서버가 `phase_key`, `phase_index`를 응답하고 UI가 해당 값으로만 진행단계 표시 |
| `[버튼]` 텍스트 출력 금지 + 입력창 위 가로 버튼 | 메시지 본문 중심 안내, 버튼 바 없음 | quick reply UI 미구현 | `apps/web/src/features/cbt/session-screen.tsx`, `apps/web/src/styles/theme.css` | 입력창 위 가로 QuickReplyBar 렌더링, 버튼 클릭 시 사용자 턴 기록 + API 이벤트 전송 |
| 왼쪽 힌트 UI 제거 | 좌측 힌트 패널 별도 노출 | 구형 컴포넌트 유지 | `apps/web/src/features/cbt/session-screen.tsx` | 좌측 힌트 영역 제거, 가이드는 코치 메시지 내부로만 제공 |
| 표면적 생각 → 핵심 메시지 유도 | 생각 단계에서 핵심 생각 도달 전 전이 가능 | 꼬리질문/횟수 제어 부재 | `apps/api/app/insights/cbt/engine.py` | 생각 단계에서 최대 2회 꼬리질문 + 스킵 버튼 제공, `core_message_text` 저장 |
| CBT에서 체크인 용어 금지 | 일부 텍스트에 체크인 표현 가능 | 문구 치환 일관성 부족 | `apps/api/app/insights/cbt/engine.py`, `apps/web/src/features/cbt/session-screen.tsx` | 사용자 노출 문구를 `오늘 기록/오늘 상태 기록`으로 통일 |
| CBT 시작 시 기분 재수집 금지 | 세션 시작 로직이 독립 입력으로 시작 가능 | bootstrap 미연결 | `apps/api/app/insights/store.py`, `apps/api/app/insights/cbt/engine.py`, `apps/web/src/features/cbt/session-screen.tsx` | bootstrap에서 오늘 기록 존재 여부만 참조, CBT 첫 질문은 상황 질문으로 시작 |
| TO DO/회고 기존 연동 유지 | 일부 상태 저장은 대화 엔진 상태와 분리 | 세션 state append 연결 약함 | `apps/api/app/insights/store.py` | TO DO 생성 시 session state에 `todo_id/commitment` 반영, 회고 완료 시 session state에 append 저장 |

## 추가 점검 항목
- QuickReplyBar는 텍스트 입력을 대체하지 않고 병행 제공(자유 입력 옵션 유지).
- 직접 입력/건너뛰기/주제 다시 선택하기/reset 등 폴백 버튼은 server state machine에서 제어.
- assistant/user 표시명은 메시지 단위 `sender_name` 우선 렌더링.

## 남은 확인(검증 단계)
- 수동 시나리오 3개: 감정 버튼 노출, 6단계 이동, 꼬리질문 최대 2회.
- 회고 완료 후 TO DO 목록 제거 + 세션 append 저장 재확인.
- API/웹 lint/typecheck/test/build 재검증.
