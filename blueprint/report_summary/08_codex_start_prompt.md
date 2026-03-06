# Codex 시작 프롬프트 (요약 리포트)

이 레포에 `blueprint/report_summary/`가 있다. 다음을 구현하라.

목표:
- /report/summary 페이지에서 기간 선택(7일/28일/커스텀) -> 리포트 미리보기
- '내보내기' 버튼 -> PDF 또는 PNG로 다운로드

요구사항:
1) 사용자 이름/닉네임은 리포트에 포함하지 않는다.
2) 위험 플래그는 구조화 신호(cbt_risk_signal)만 사용하며, include_sensitive=false면 숨긴다.
3) 데이터 계약은 blueprint/report_summary/02_domain/data_contracts.json을 따른다.
4) 설문은 불규칙하게 들어올 수 있다. 기간 내 없으면 '최근 설문 + 경과일'을 표시한다.
5) 결측(체크인 적음)에서도 동작해야 하며 '관찰 밀도' 배너를 표시한다.

작업 범위:
- API 2개 구현:
  - GET /v1/report/summary?start_date&end_date
  - POST /v1/report/summary/export {start_date,end_date,format,png/pdf,include_sensitive}
- UI:
  - PeriodPicker, ReportPreview, ExportModal, DensityBanner
- Export:
  - 서버에서 HTML->PDF/PNG 생성(권장: headless chrome)

제출:
- 구현 파일 + 간단한 실행 방법(README 업데이트)
