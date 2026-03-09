# CBT Patch Audit (v5)

## 점검 대상
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/api/app/insights/cbt/engine.py`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/api/app/insights/cbt/llm_limited.py`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/api/app/insights/store.py`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/api/app/insights/models.py`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/web/src/features/cbt/session-screen.tsx`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/apps/web/src/styles/theme.css`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/docs/cbt_flow_spec.md`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/docs/cbt_quick_reply_registry.md`
- `/Users/parkjieum/Desktop/AI/98_프젝5/project/docs/cbt/thinking_patterns_ko.md`

## 요구사항별 반영 현황
| 항목 | 반영 상태 | 반영 파일 | 비고 |
|---|---|---|---|
| 생각패턴(19종) 카탈로그 추가 | 완료 | `thinking_patterns_ko.json`, `thinking_patterns_ko.ts`, `docs/cbt/thinking_patterns_ko.md` | 문서/런타임/머신리더블 동시 반영 |
| 핵심생각 정교화 + 확인 단계 | 완료 | `engine.py`, `llm_limited.py` | `core_confirm` 단계에서 확인 액션 분기 |
| evidence 질문에 핵심생각 포함 | 완료 | `engine.py` | for/against 질문 모두 core 포함 |
| LLM 관여 확대(분석/추천/복구) | 완료 | `llm_limited.py`, `engine.py` | JSON 기반 fallback 포함 |
| Quick Reply prefill/action 분리 유지 | 완료 | `engine.py`, `session-screen.tsx` | prefill은 입력창 채우기만 수행 |
| 반복 문장 방지(서버) | 완료 | `engine.py` | 유사도 기반 중복 제거 + slot 반복 억제 |
| 비문 후처리(되죠요 등) | 완료 | `engine.py` | `normalize_korean_polite` 적용 |
| 중복 append 방지(클라) | 완료 | `session-screen.tsx`, `models.py`, `store.py`, `types.ts` | `message_id` 기반 dedupe |
| 진행단계 폭 축소 + 채팅폭 확장 | 완료 | `theme.css` | 데스크톱 컬럼 재비율 조정 |
| Quick Reply 스크롤 완화 | 완료 | `theme.css` | `flex-wrap`로 전환, 수평 스크롤 제거 |

## 남은 확인 포인트
- 실제 브라우저에서 긴 quick reply 세트가 2줄 내에서 자연스럽게 보이는지 시각 검증 필요
- LLM 활성화 환경에서 `core_confirm` 문장 품질(반복/중복 감소) 추가 샘플 점검 필요
