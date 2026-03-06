# 검색 스펙

## 검색 대상
- feed_public_id
- title
- body_text
- author display_name
- tags

## 검색 UX
- 검색창 상단 고정
- 자동완성:
  - 고유번호
  - 작성자명
  - 태그
  - 최근 검색어(선택)

## 검색 결과 정렬
- 기본: 최신순
- 결과 표시: 첫 15-20개 + 더보기

## 추천 인덱스 필드
- feed_public_id: keyword + prefix search
- title/body_text: full-text
- author display_name: keyword + prefix search
- tags: keyword
