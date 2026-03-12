# CBT Patch Audit (v3.1)

## 점검 대상
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/api/app/insights/cbt/engine.py`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/api/tests/test_cbt_state_machine_flow.py`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/web/src/features/cbt/session-screen.tsx`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/web/src/styles/theme.css`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/docs/cbt_flow_spec.md`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/docs/cbt_quick_reply_registry.md`

## 요구사항별 반영 결과
| 항목 | 현재 상태 | 수정 파일 | 결과 |
|---|---|---|---|
| Quick Reply prefill/action 분리 | 반영 | `engine.py`, `session-screen.tsx` | prefill은 입력창 채우기만, action만 즉시 실행 |
| 단계별 버튼 세트 엄격 분리 | 반영 | `engine.py` | `evidence_for`/`evidence_against` 세트 분리 고정 |
| prefill 콜론 규칙 | 반영 | `engine.py` | 숫자 강도 제외 prefill 기본 `: ` 유지 |
| 감정 강도 질문 문구 개선 | 반영 | `engine.py` | “버튼으로 고르세요” 제거, `{감정}의 정도(0~100)` 형태 |
| 핵심 생각 확정 요약 후 근거 단계 진입 | 반영 | `engine.py` | core 메시지 1회 정리 후 evidence 진입 |
| 반복 문장 제거 | 반영 | `engine.py` | turn 내부/직전턴 중복 제거 + slot 반복 억제 |
| 비문(되죠요 등) 보정 | 반영 | `engine.py` | 후처리 normalize 적용 |
| 유연한 복구(Repair) | 반영 | `engine.py` | 무효 입력 시 완곡 안내 + retry/reset/end 제공 |
| TO DO 수동 선택 UI 제거 | 반영 | `session-screen.tsx` | 수동 선택/직접추가 제거, state 기반 자동 TO DO 표시 |
| 단계 박스 과도한 높이 | 반영 | `theme.css` | 데스크톱 강제 min-height/height 제거 |

## 추가 확인 사항
- TO DO 저장은 세션 저장 시 `draftState.commitment_*`를 기반으로 자동 매핑합니다.
- 기존 회고 탭/저장 append 구조는 유지합니다.
- CBT 화면에서 `체크인` 용어는 사용하지 않습니다.
