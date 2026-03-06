# CBT Feature Blueprint

이 폴더는 MindLab 서비스의 CBT 대화 기능 blueprint다.
이번 버전은 `CBT 대화 자체`와 `모델/데이터셋에 export할 구조화 신호`를 명확히 분리하는 데 초점을 둔다.

## 핵심 원칙
- CBT 기능은 challenge, free journal과 분리된 별도 모듈이다.
- 모델 입력에 바로 쓰는 것은 자유 텍스트 전체가 아니라 구조화된 session summary와 risk signal이다.
- core belief / intermediate belief는 세션 내 가설로 유지하고, 초기 모델의 핵심 feature로 사용하지 않는다.
- risk 관련 정보는 일반 추천보다 safety gate에 우선 사용한다.

## 이번 버전에서 반영한 내용
- `cbt_session_summary`와 `cbt_risk_signal` export 계약 추가
- current-state 모델과 연결 가능한 CBT 변수 정의
- model feature로 쓰지 않는 CBT 내부 가설값 정의
- wellness/digital health 수준에서의 boundary와 copy 가이드 반영
