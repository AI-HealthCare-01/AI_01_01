# 필드/표시 규칙

## 메뉴명
- 사용자용: 일기
- 내부명: journal / free_journal

## 입력
- 제목: 선택, 최대 100자 권장
- 본문: 필수, 최대 5,000자 권장

## 목록 표시
- 제목이 있으면 제목 우선
- 제목이 없으면 본문 첫 줄 20-30자 preview_text 사용

## 활동로그 반영
- has_journal_entry = true
- journal_entry_count = 해당 날짜 active 상태 엔트리 수
