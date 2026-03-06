# Challenge Feature Blueprint

이 폴더는 MindLab 서비스의 선택형 challenge 기능을 구현하기 위한 최신 blueprint다.

## 이번 버전의 목적
- 현재 상태(nowcast) 모델과 연동되는 challenge 데이터 구조를 고정한다.
- challenge는 사용자가 선택해서 진행하는 행동 개입 기능이며, CBT와 자유일기와 분리한다.
- challenge 데이터는 추천, 대시보드, post-launch 재학습에 모두 재사용된다.
- 지속형 challenge는 동시에 최대 3개까지 활성화할 수 있다.

## 이번 버전에서 반영한 수정
- 모델 타깃이 `week_delta/month_delta`가 아니라 `오늘 상태(dep/anx/ins)`로 바뀐 점 반영
- `challenge_exposure`, `challenge_enrollment`, `challenge_day_log`를 분리
- 추천 사유와 사용자 반응(accept/decline/ignore)을 분리 수집
- feature importance를 인과로 해석하지 않도록 recommendation copy 규칙 보강
- CBT 관련 challenge는 제거 상태 유지
- 자유일기 관련 challenge는 제거 상태 유지

## 폴더 구조
- `00_overview/`: 정책, 근거 요약, 변경 이력
- `01_product/`: challenge 카탈로그, 사용자 흐름, 템플릿
- `02_domain/`: 데이터 명세, 상태-챌린지 매핑, 추천 규칙
- `03_backend/`: API, DB, 이벤트, 배치 규칙
- `04_frontend/`: 화면 및 컴포넌트 구조
- `05_analytics/`: KPI, 로그, 실험 규칙
- `06_modeling/`: model feature linkage 및 활용 주의사항
- `07_implementation/`: Codex 시작 프롬프트와 phased todo
- `sources/`: 근거 자료 목록

## 구현 우선순위
1. challenge policy / slot rule 고정
2. catalog + exposure + enrollment + day log DB 생성
3. recommendation rule v1 구현
4. app UI 및 completion logging 구현
5. analytics / KPI 이벤트 구현
6. modeling feature mart와 연결
