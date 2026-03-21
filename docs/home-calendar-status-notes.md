# 홈/심리검사 월간 출석 캘린더 상태 색상 메모

적용 화면:
- `apps/web/app/page.tsx`
- `apps/web/app/assessments/page.tsx`
- `apps/web/app/journal/page.tsx`
- `apps/web/app/mypage/activity-log/page.tsx`

규칙:
- 월간 출석 캘린더는 체크인 완료 날짜만 색상을 표시한다.
- 색상은 해당 날짜 체크인 feature에서 가장 두드러진 상태를 기준으로 정한다.
- 상태/색상 매핑은 아래와 같다.
  - 좋음: 핑크
  - 불안: 노랑
  - 우울: 파랑
  - 불면: 보라
- 모든 색상은 서비스 스타일 브리프에 맞춰 파스텔 계열로 유지한다.
- 홈과 심리검사 화면은 같은 캘린더 컴포넌트와 같은 상태 판별 로직을 공유한다.
