# 프론트 화면 설계

## Route
- /report/summary

## 주요 컴포넌트
- PeriodPicker: 7일/28일/커스텀
- ReportPreview: 섹션별 렌더(페이지 스타일)
- ExportModal: PDF/PNG 선택 + include_sensitive 토글
- DensityBanner: 관찰 밀도/주의 문구

## 상태
- loading: skeleton
- error: 재시도 + 문의 안내
- empty: '선택 기간에 데이터가 부족합니다' + 기간 변경 제안

## 그래프
- 3개 스몰 멀티플 라인 차트(우울/불안/불면)
- 설문 시행일 marker
- 결측은 라인 끊김
