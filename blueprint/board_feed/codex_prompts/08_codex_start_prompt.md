# Codex 시작 프롬프트 (게시판/피드)

이 레포에 `blueprint/board_feed/`가 있다. 다음을 구현하라.

목표:
- 최신순 SNS형 게시판 피드
- 탭: 피드 / 공지 / 북마크
- 제목(선택), 본문(필수), 사진(선택), 익명 작성
- 좋아요 / 북마크 / 댓글 / 신고
- 피드 고유번호 표시 및 검색 가능
- 관리자 모더레이션 큐(신고 + 유해언어 탐지)

반드시 지킬 것:
1) 메인 피드는 완전 무한스크롤이 아니라 '더보기' 버튼 방식으로 구현.
2) 공지는 별도 탭으로 분리. 중요 공지 1개만 메인 피드 상단 핀 고정 가능.
3) 문의/피드백 기능은 구현 범위에서 제외.
4) 익명은 대외 익명만 허용. 내부 관리자는 작성자 계정을 식별 가능해야 함.
5) 본문 최대 1,500자, 댓글 최대 500자, 제목 최대 60자.
6) 피드 고유번호(feed_public_id)는 카드에 표시하고 검색 대상에 포함.
7) 유해언어 탐지는 `05_moderation/toxic_language_model_integration.md`를 따른다.

구현 범위:
- API:
  - GET /v1/board/feed
  - GET /v1/board/notices
  - GET /v1/board/bookmarks
  - POST /v1/board/post
  - POST /v1/board/post/{id}/like
  - POST /v1/board/post/{id}/bookmark
  - POST /v1/board/post/{id}/report
  - POST /v1/board/post/{id}/comments
- UI:
  - FeedTabs, FeedSearchBar, FeedCard, PostComposer, BookmarkList, NoticeList
- Moderation:
  - 신고 큐
  - 규칙 기반 필터
  - 모델 기반 큐 적재(모델 import 또는 API 연동 가능)

제출:
- 구현 코드 + README 업데이트 + 환경변수 예시
