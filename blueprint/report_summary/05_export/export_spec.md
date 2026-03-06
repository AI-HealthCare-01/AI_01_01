# 내보내기(PDF/PNG) 사양

## 목표
- 미리보기 화면과 동일한 내용/레이아웃으로 PDF 및 PNG 내보내기

## 권장 구현(서버)
- 1) Report HTML을 서버에서 렌더(템플릿 + 데이터 주입)
- 2) Headless Chromium으로:
  - PDF: printToPDF(A4, margin, page numbers)
  - PNG: fullPage screenshot(긴 세로)

## 요구사항
- 페이지: 2~4p 권장(기간/데이터량에 따라)
- 헤더에 사용자 이름/닉네임 없음
- 민감정보(위험 플래그) include_sensitive=false면 섹션 숨김
- 파일명 예:
  - mindlab-summary-YYYYMMDD-YYYYMMDD.pdf
  - mindlab-summary-YYYYMMDD-YYYYMMDD.png
- 보안:
  - 다운로드 URL은 짧은 만료(예: 10분)
  - 서버 로그에 리포트 본문 저장 금지(필요시 해시만)
