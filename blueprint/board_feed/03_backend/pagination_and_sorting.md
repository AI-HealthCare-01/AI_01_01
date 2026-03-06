# 정렬/로딩 규칙

## 피드
- 기본 정렬: created_at DESC
- 로딩: cursor 기반 + 'n개 더보기'
- 첫 로드: 15~20개
- 다음 로드: 15~20개

## 공지
- pinned notice 1개 우선
- 나머지 공지는 created_at DESC

## 북마크
- 기본 정렬: bookmark.created_at DESC
- 옵션(후순위): 원글 최신순
