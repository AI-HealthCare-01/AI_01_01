# CBT + Dashboard + Summary Report

## 구현 범위

- CBT
  - 대화형 세션(`message_thread`) + 세로 진행 stepper + safety banner + 요약/과제 카드
  - `POST /v1/cbt/conversation/turn` 실시간 대화 응답
  - JSON Schema(`blueprint/cbt/02_domain/cbt_state_schema.json`) 기반 구조화 출력 검증
  - `cbt_session_summary`, `cbt_risk_signal`, `cbt_case_memory` 분리 저장
  - `risk_level >= 2` safety-first 플로우 반환
  - OpenAI 키가 설정된 경우 LLM 기반 구조화 출력 생성, 미설정 시 규칙 기반 fallback
- 상태 대시보드
  - 모드: `7d`, `4w_weekly_avg`
  - 우울/불안/불면 3개 그래프를 한 화면 canvas에 세로 배치
- 활동 대시보드
  - 체크인/챌린지/CBT/설문 요약 카드
  - 월간 체크인 캘린더
- 요약 리포트
  - 기간별 JSON 미리보기
  - PDF/PNG 내보내기
  - 헤더에 이름/닉네임 제외
  - 위험 플래그는 구조화 신호(`cbt_risk_signal`)만 사용

## API 엔드포인트

### CBT
- `POST /v1/cbt/conversation/turn`
- `POST /v1/cbt/sessions`
- `GET /v1/cbt/sessions/{session_id}/summary`
- `POST /v1/cbt/risk-signal`

### Dashboard
- `GET /v1/dashboard/symptom?mode=7d|4w_weekly_avg`
- `GET /v1/dashboard/activity`

### Report Summary
- `GET /v1/report/summary?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&include_sensitive=true|false`
- `POST /v1/report/summary/export` (`format: pdf|png`)

## 웹 라우트

- `/cbt`
- `/dashboard/state`
- `/dashboard/activity`
- `/report/summary`

## blueprint 반영 체크리스트

- [x] `cbt_session_summary` / `cbt_risk_signal` 분리 저장
- [x] `risk_level >= 2` safety-first 우선
- [x] challenge / journal과 CBT entry point 분리
- [x] CBT 대화형 화면(message thread) + 요약/과제 카드
- [x] extractor -> planner -> writer 파이프라인(LLM + fallback)
- [x] 모델 연동용 export field와 internal hypothesis field 분리
- [ ] 위기 대응 외부 연계(지역/국가 단위 리소스 라우팅 고도화)
- [ ] 다중 턴 세션 메모리 장기보관 정책(암호화/보존기간) 확정

## 보안/표시 원칙

- 모든 endpoint 인증 필요 + 본인 데이터만 조회
- 리포트 위험 섹션은 `include_sensitive=false` 시 숨김
- 리포트 헤더에 사용자 이름/닉네임 미포함
- 자유 텍스트 전문은 모델 입력/리포트 기본 출력에 직접 사용하지 않음
- CBT 추천 문구는 사용자 1인칭 입력 템플릿으로 제공하고 자동 전송하지 않음
