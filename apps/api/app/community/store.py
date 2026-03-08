from __future__ import annotations

import sqlite3
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from app.auth.store import AuthStore
from app.core_inputs.store import CoreInputStore

from .models import (
    BoardCommentCreateRequest,
    BoardCommentListItem,
    BoardCommentPayload,
    BoardFeedItem,
    BoardListResponse,
    BoardModerationStatus,
    BoardPostAuthor,
    BoardPostCreateRequest,
    BoardPostUpdateRequest,
    BoardPostEngagement,
    BoardPostPayload,
    BoardReportReasonCode,
    BoardReportRequest,
    BoardToggleResponse,
    BoardVisibilityStatus,
    ModerationQueueGroup,
    ModerationQueueItem,
    ModerationQueuesResponse,
    ModerationQueueType,
    MyPageActivitySummary,
    MyPageCommentSummary,
    MyPageConsentResponse,
    MyPageConsentUpdateRequest,
    MyPageHomeResponse,
    MyPagePostSummary,
    MyPageProfileSummary,
    MyPageProfileUpdateRequest,
    MyPageProfileUpdateResponse,
    MyPageQuickLink,
    MyPageReportSummary,
    MyPageReportVaultItem,
    MyPageTicketSummary,
    PasswordChangeRequest,
    PasswordChangeResponse,
    SupportAdminReplyRequest,
    SupportFollowupRequest,
    SupportMessageAuthorType,
    SupportMessagePayload,
    SupportNotificationListResponse,
    SupportNotificationPayload,
    SupportQueueSummaryResponse,
    SupportResolveResponse,
    SupportTicketCreateRequest,
    SupportTicketDetailResponse,
    SupportTicketListItem,
    SupportTicketPayload,
    SupportTicketPriority,
    SupportTicketStatus,
)

HATE_KEYWORDS = [
    "혐오",
    "차별",
    "죽어",
    "fuck",
    "bitch",
    "asshole",
    "멍청",
]

SAFETY_KEYWORDS = [
    "자해",
    "자살",
    "죽고",
    "타해",
    "폭력",
    "kill",
    "suicide",
    "harm",
]

SUPPORT_IMPORTANT_KEYWORDS = ["오류", "결제", "환불", "장애", "로그인 불가", "잠김"]
SUPPORT_URGENT_KEYWORDS = [
    "자해",
    "자살",
    "타해",
    "위협",
    "응급",
    "긴급",
    "suicide",
    "harm",
]
SUPPORT_SENSITIVE_KEYWORDS = [
    "자해",
    "자살",
    "타해",
    "위협",
    "개인정보",
    "유출",
    "학대",
    "괴롭힘",
    "suicide",
    "violence",
]

BOARD_POST_BODY_MAX_BYTES = 4500

CONSENT_TYPE_TO_FIELD = {
    "terms": "terms_required",
    "privacy": "privacy_required",
    "sensitive_data": "sensitive_data_required",
    "personalization": "personalization_optional",
    "model_improvement": "model_improvement_optional",
    "marketing": "marketing_optional",
}


class CommunityStore:
    def __init__(self, database_path: Path):
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)

        # Ensure shared auth/core tables are ready.
        AuthStore(database_path)
        CoreInputStore(database_path)

        self._initialize_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(UTC).isoformat()

    @staticmethod
    def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table_name,),
        ).fetchone()
        return row is not None

    def _initialize_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS board_post (
                  post_id TEXT PRIMARY KEY,
                  feed_public_id TEXT NOT NULL UNIQUE,
                  author_user_id TEXT NOT NULL,
                  title TEXT,
                  display_title TEXT,
                  body_text TEXT NOT NULL,
                  body_preview TEXT NOT NULL,
                  is_anonymous INTEGER NOT NULL DEFAULT 0,
                  is_notice INTEGER NOT NULL DEFAULT 0,
                  is_pinned_notice INTEGER NOT NULL DEFAULT 0,
                  visibility_status TEXT NOT NULL DEFAULT 'visible',
                  moderation_status TEXT NOT NULL DEFAULT 'clear',
                  created_at TEXT NOT NULL,
                  updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS board_post_image (
                  image_id TEXT PRIMARY KEY,
                  post_id TEXT NOT NULL,
                  image_url TEXT NOT NULL,
                  display_order INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS board_tag (
                  tag_id TEXT PRIMARY KEY,
                  tag_name TEXT NOT NULL UNIQUE
                );

                CREATE TABLE IF NOT EXISTS board_post_tag (
                  post_id TEXT NOT NULL,
                  tag_id TEXT NOT NULL,
                  PRIMARY KEY (post_id, tag_id)
                );

                CREATE TABLE IF NOT EXISTS board_comment (
                  comment_id TEXT PRIMARY KEY,
                  post_id TEXT NOT NULL,
                  author_user_id TEXT NOT NULL,
                  body_text TEXT NOT NULL,
                  is_anonymous INTEGER NOT NULL DEFAULT 0,
                  visibility_status TEXT NOT NULL DEFAULT 'visible',
                  created_at TEXT NOT NULL,
                  updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS board_like (
                  post_id TEXT NOT NULL,
                  user_id TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  PRIMARY KEY (post_id, user_id)
                );

                CREATE TABLE IF NOT EXISTS board_bookmark (
                  post_id TEXT NOT NULL,
                  user_id TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  PRIMARY KEY (post_id, user_id)
                );

                CREATE TABLE IF NOT EXISTS board_report (
                  report_id TEXT PRIMARY KEY,
                  target_type TEXT NOT NULL,
                  target_id TEXT NOT NULL,
                  reporter_user_id TEXT NOT NULL,
                  reason_code TEXT NOT NULL,
                  detail_text TEXT,
                  created_at TEXT NOT NULL,
                  review_status TEXT NOT NULL DEFAULT 'queued'
                );

                CREATE TABLE IF NOT EXISTS board_moderation_event (
                  event_id TEXT PRIMARY KEY,
                  target_type TEXT NOT NULL,
                  target_id TEXT NOT NULL,
                  source_type TEXT NOT NULL,
                  category_code TEXT,
                  confidence REAL,
                  action_code TEXT,
                  actor_user_id TEXT,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS board_moderation_queue (
                  queue_item_id TEXT PRIMARY KEY,
                  queue_type TEXT NOT NULL,
                  target_type TEXT NOT NULL,
                  target_id TEXT NOT NULL,
                  source_type TEXT NOT NULL,
                  reason_code TEXT,
                  detail_text TEXT,
                  confidence REAL,
                  status TEXT NOT NULL DEFAULT 'queued',
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS support_ticket (
                  ticket_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  ticket_type TEXT NOT NULL,
                  title TEXT NOT NULL,
                  category TEXT NOT NULL,
                  related_feature TEXT,
                  reply_requested INTEGER NOT NULL DEFAULT 1,
                  status TEXT NOT NULL,
                  priority TEXT NOT NULL DEFAULT 'normal',
                  sensitive_queue_flag INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  resolved_at TEXT,
                  closed_at TEXT
                );

                CREATE TABLE IF NOT EXISTS support_message (
                  message_id TEXT PRIMARY KEY,
                  ticket_id TEXT NOT NULL,
                  author_type TEXT NOT NULL,
                  author_id TEXT,
                  body TEXT NOT NULL,
                  is_followup INTEGER NOT NULL DEFAULT 0,
                  internal_only INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS support_attachment (
                  attachment_id TEXT PRIMARY KEY,
                  ticket_id TEXT NOT NULL,
                  message_id TEXT,
                  file_name TEXT NOT NULL,
                  mime_type TEXT NOT NULL,
                  file_size_bytes INTEGER NOT NULL,
                  storage_key TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS support_notification (
                  notification_id TEXT PRIMARY KEY,
                  recipient_type TEXT NOT NULL,
                  recipient_id TEXT NOT NULL,
                  ticket_id TEXT NOT NULL,
                  event_type TEXT NOT NULL,
                  is_read INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL,
                  read_at TEXT
                );

                CREATE TABLE IF NOT EXISTS support_status_history (
                  history_id TEXT PRIMARY KEY,
                  ticket_id TEXT NOT NULL,
                  old_status TEXT,
                  new_status TEXT NOT NULL,
                  changed_by_type TEXT NOT NULL,
                  changed_by_id TEXT,
                  note TEXT,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS report_export_vault (
                  report_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  period_start TEXT NOT NULL,
                  period_end TEXT NOT NULL,
                  format TEXT NOT NULL,
                  file_name TEXT NOT NULL,
                  content_type TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS mypage_security_audit (
                  audit_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  action_code TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  detail_json TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_board_post_created_at
                ON board_post(created_at DESC);

                CREATE INDEX IF NOT EXISTS idx_board_bookmark_user_created
                ON board_bookmark(user_id, created_at DESC);

                CREATE INDEX IF NOT EXISTS idx_board_comment_post_created
                ON board_comment(post_id, created_at DESC);

                CREATE INDEX IF NOT EXISTS idx_support_ticket_user_updated
                ON support_ticket(user_id, updated_at DESC);

                CREATE INDEX IF NOT EXISTS idx_support_notification_recipient
                ON support_notification(recipient_type, recipient_id, created_at DESC);

                CREATE INDEX IF NOT EXISTS idx_report_export_vault_user_created
                ON report_export_vault(user_id, created_at DESC);
                """
            )
            conn.commit()

    @staticmethod
    def _preview_text(text: str, max_chars: int = 240) -> str:
        normalized = " ".join(text.split())
        if len(normalized) <= max_chars:
            return normalized
        return f"{normalized[:max_chars].rstrip()}..."

    def _next_feed_public_id(self, conn: sqlite3.Connection) -> str:
        row = conn.execute(
            """
            SELECT MAX(CAST(SUBSTR(feed_public_id, 3) AS INTEGER)) AS max_seq
            FROM board_post
            WHERE feed_public_id LIKE 'P-%'
            """
        ).fetchone()
        base = int(row["max_seq"] or 102300)
        return f"P-{base + 1:06d}"

    def _ensure_demo_feed(self, conn: sqlite3.Connection, viewer_user_id: str) -> None:
        row = conn.execute("SELECT COUNT(*) AS cnt FROM board_post").fetchone()
        if int(row["cnt"] or 0) > 0:
            return

        now = self._now_iso()
        demo_posts = [
            {
                "title": "커뮤니티 이용 안내",
                "body": (
                    "감정의 힘듦 표현은 허용되며, 위협/혐오/개인정보 노출은"
                    " 제한됩니다."
                ),
                "is_notice": 1,
                "is_pinned": 1,
                "anonymous": 0,
            },
            {
                "title": "오늘 잠들기 루틴 공유",
                "body": (
                    "취침 1시간 전 휴대폰을 내려놓고 스트레칭 5분을 하면"
                    " 잠드는 시간이 줄었습니다."
                ),
                "is_notice": 0,
                "is_pinned": 0,
                "anonymous": 1,
            },
            {
                "title": None,
                "body": "저녁 산책 후 마음이 조금 진정됐어요.",
                "is_notice": 0,
                "is_pinned": 0,
                "anonymous": 0,
            },
        ]

        for item in demo_posts:
            post_id = f"pst_{uuid.uuid4().hex}"
            feed_public_id = self._next_feed_public_id(conn)
            title = item["title"]
            conn.execute(
                """
                INSERT INTO board_post (
                  post_id,
                  feed_public_id,
                  author_user_id,
                  title,
                  display_title,
                  body_text,
                  body_preview,
                  is_anonymous,
                  is_notice,
                  is_pinned_notice,
                  visibility_status,
                  moderation_status,
                  created_at,
                  updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    post_id,
                    feed_public_id,
                    viewer_user_id,
                    title,
                    title,
                    str(item["body"]),
                    self._preview_text(str(item["body"])),
                    int(item["anonymous"]),
                    int(item["is_notice"]),
                    int(item["is_pinned"]),
                    BoardVisibilityStatus.visible.value,
                    BoardModerationStatus.clear.value,
                    now,
                    now,
                ),
            )
        conn.commit()

    @staticmethod
    def _to_datetime(value: str | None) -> datetime | None:
        if not value:
            return None
        return datetime.fromisoformat(value)

    def _board_tags(self, conn: sqlite3.Connection, post_id: str) -> list[str]:
        rows = conn.execute(
            """
            SELECT bt.tag_name
            FROM board_post_tag bpt
            JOIN board_tag bt ON bt.tag_id = bpt.tag_id
            WHERE bpt.post_id = ?
            ORDER BY bt.tag_name ASC
            """,
            (post_id,),
        ).fetchall()
        return [str(row["tag_name"]) for row in rows]

    def _board_images(self, conn: sqlite3.Connection, post_id: str) -> list[str]:
        rows = conn.execute(
            """
            SELECT image_url
            FROM board_post_image
            WHERE post_id = ?
            ORDER BY display_order ASC
            """,
            (post_id,),
        ).fetchall()
        return [str(row["image_url"]) for row in rows]

    def _board_engagement(
        self,
        conn: sqlite3.Connection,
        post_id: str,
        viewer_user_id: str,
    ) -> BoardPostEngagement:
        like_row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM board_like WHERE post_id = ?",
            (post_id,),
        ).fetchone()
        bookmark_row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM board_bookmark WHERE post_id = ?",
            (post_id,),
        ).fetchone()
        comment_row = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM board_comment
            WHERE post_id = ?
              AND visibility_status = 'visible'
            """,
            (post_id,),
        ).fetchone()
        report_row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM board_report WHERE target_type = 'post' AND target_id = ?",
            (post_id,),
        ).fetchone()

        viewer_liked = conn.execute(
            "SELECT 1 FROM board_like WHERE post_id = ? AND user_id = ?",
            (post_id, viewer_user_id),
        ).fetchone()
        viewer_bookmarked = conn.execute(
            "SELECT 1 FROM board_bookmark WHERE post_id = ? AND user_id = ?",
            (post_id, viewer_user_id),
        ).fetchone()

        return BoardPostEngagement(
            like_count=int(like_row["cnt"] or 0),
            bookmark_count=int(bookmark_row["cnt"] or 0),
            comment_count=int(comment_row["cnt"] or 0),
            report_count=int(report_row["cnt"] or 0),
            viewer_liked=viewer_liked is not None,
            viewer_bookmarked=viewer_bookmarked is not None,
        )

    def _build_board_item(
        self,
        conn: sqlite3.Connection,
        row: sqlite3.Row,
        viewer_user_id: str,
    ) -> BoardFeedItem:
        post_id = str(row["post_id"])
        author_user_id = str(row["author_user_id"])
        nickname = str(row["nickname"]) if row["nickname"] else "사용자"
        is_anonymous = bool(row["is_anonymous"])

        display_name = nickname
        if is_anonymous and author_user_id != viewer_user_id:
            display_name = "익명"

        post_payload = BoardPostPayload(
            post_id=post_id,
            feed_public_id=str(row["feed_public_id"]),
            title=(str(row["title"]) if row["title"] else None),
            display_title=(str(row["display_title"]) if row["display_title"] else None),
            body_text=str(row["body_text"]),
            body_preview=str(row["body_preview"]),
            tag_ids=self._board_tags(conn, post_id),
            image_urls=self._board_images(conn, post_id),
            created_at=datetime.fromisoformat(str(row["created_at"])),
            updated_at=self._to_datetime(str(row["updated_at"])) if row["updated_at"] else None,
            is_notice=bool(row["is_notice"]),
            is_pinned_notice=bool(row["is_pinned_notice"]),
            is_anonymous=is_anonymous,
            visibility_status=BoardVisibilityStatus(str(row["visibility_status"])),
            moderation_status=BoardModerationStatus(str(row["moderation_status"])),
        )

        return BoardFeedItem(
            post=post_payload,
            author=BoardPostAuthor(author_user_id=author_user_id, display_name=display_name),
            engagement=self._board_engagement(conn, post_id, viewer_user_id),
        )

    @staticmethod
    def _parse_cursor(cursor: str | None) -> int:
        if cursor is None or cursor.strip() == "":
            return 0
        try:
            offset = int(cursor)
        except ValueError as exc:
            raise ValueError("invalid_cursor") from exc
        if offset < 0:
            raise ValueError("invalid_cursor")
        return offset

    @staticmethod
    def _normalize_limit(limit: int) -> int:
        return max(1, min(20, limit))

    @staticmethod
    def _text_contains_any(text: str, words: list[str]) -> bool:
        lowered = text.lower()
        return any(word.lower() in lowered for word in words)

    @staticmethod
    def _utf8_len(text: str) -> int:
        return len(text.encode("utf-8"))

    def _validate_post_body(self, body_text: str) -> str:
        normalized = body_text.strip()
        if not normalized:
            raise ValueError("invalid_post_body")
        if self._utf8_len(normalized) > BOARD_POST_BODY_MAX_BYTES:
            raise ValueError("invalid_post_body_bytes")
        return normalized

    def _detect_text_queue_types(self, text: str) -> set[ModerationQueueType]:
        queue_types: set[ModerationQueueType] = set()
        if self._text_contains_any(text, HATE_KEYWORDS):
            queue_types.add(ModerationQueueType.hate)
        if self._text_contains_any(text, SAFETY_KEYWORDS):
            queue_types.add(ModerationQueueType.safety)
        return queue_types

    def _insert_moderation_queue(
        self,
        conn: sqlite3.Connection,
        *,
        queue_type: ModerationQueueType,
        target_type: str,
        target_id: str,
        source_type: str,
        reason_code: str | None,
        detail_text: str | None,
        confidence: float | None,
    ) -> None:
        now = self._now_iso()
        conn.execute(
            """
            INSERT INTO board_moderation_queue (
              queue_item_id,
              queue_type,
              target_type,
              target_id,
              source_type,
              reason_code,
              detail_text,
              confidence,
              status,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)
            """,
            (
                f"mq_{uuid.uuid4().hex}",
                queue_type.value,
                target_type,
                target_id,
                source_type,
                reason_code,
                detail_text,
                confidence,
                now,
            ),
        )
        conn.execute(
            """
            INSERT INTO board_moderation_event (
              event_id,
              target_type,
              target_id,
              source_type,
              category_code,
              confidence,
              action_code,
              actor_user_id,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"mev_{uuid.uuid4().hex}",
                target_type,
                target_id,
                source_type,
                reason_code,
                confidence,
                "queued",
                None,
                now,
            ),
        )

    def list_board_feed(
        self,
        user_id: str,
        cursor: str | None,
        limit: int,
        q: str | None,
        tag: str | None,
    ) -> BoardListResponse:
        offset = self._parse_cursor(cursor)
        resolved_limit = self._normalize_limit(limit)

        with self._connect() as conn:
            self._ensure_demo_feed(conn, user_id)

            params: list[object] = []
            where_clauses = ["bp.visibility_status = 'visible'", "bp.is_notice = 0"]

            search = (q or "").strip()
            if search:
                pattern = f"%{search}%"
                where_clauses.append(
                    "(" 
                    "bp.feed_public_id LIKE ? OR "
                    "COALESCE(bp.title, '') LIKE ? OR "
                    "bp.body_text LIKE ? OR "
                    "COALESCE(NULLIF(au.nickname, ''), NULLIF(au.coach_name, ''), '') LIKE ?"
                    ")"
                )
                params.extend([pattern, pattern, pattern, pattern])

            tag_name = (tag or "").strip()
            if tag_name:
                where_clauses.append(
                    "EXISTS ("
                    "SELECT 1 FROM board_post_tag bpt "
                    "JOIN board_tag bt ON bt.tag_id = bpt.tag_id "
                    "WHERE bpt.post_id = bp.post_id AND bt.tag_name = ?"
                    ")"
                )
                params.append(tag_name)

            query = (
                "SELECT bp.*, "
                "COALESCE(NULLIF(au.nickname, ''), NULLIF(au.coach_name, ''), '사용자') AS nickname "
                "FROM board_post bp "
                "LEFT JOIN account_user au ON au.user_id = bp.author_user_id "
                f"WHERE {' AND '.join(where_clauses)} "
                "ORDER BY datetime(bp.created_at) DESC, bp.feed_public_id DESC "
                "LIMIT ? OFFSET ?"
            )
            params.extend([resolved_limit + 1, offset])

            rows = conn.execute(query, tuple(params)).fetchall()
            has_more = len(rows) > resolved_limit
            visible_rows = rows[:resolved_limit]
            items = [self._build_board_item(conn, row, user_id) for row in visible_rows]

            pinned_notice: BoardFeedItem | None = None
            if offset == 0:
                pinned_row = conn.execute(
                    """
                    SELECT bp.*,
                           COALESCE(NULLIF(au.nickname, ''), NULLIF(au.coach_name, ''), '사용자') AS nickname
                    FROM board_post bp
                    LEFT JOIN account_user au ON au.user_id = bp.author_user_id
                    WHERE bp.visibility_status = 'visible'
                      AND bp.is_notice = 1
                      AND bp.is_pinned_notice = 1
                    ORDER BY datetime(bp.created_at) DESC
                    LIMIT 1
                    """
                ).fetchone()
                if pinned_row:
                    pinned_notice = self._build_board_item(conn, pinned_row, user_id)

            return BoardListResponse(
                items=items,
                next_cursor=str(offset + resolved_limit) if has_more else None,
                pinned_notice=pinned_notice,
            )

    def list_board_notices(
        self,
        user_id: str,
        cursor: str | None,
        limit: int,
    ) -> BoardListResponse:
        offset = self._parse_cursor(cursor)
        resolved_limit = self._normalize_limit(limit)

        with self._connect() as conn:
            self._ensure_demo_feed(conn, user_id)
            rows = conn.execute(
                """
                SELECT bp.*,
                       COALESCE(NULLIF(au.nickname, ''), NULLIF(au.coach_name, ''), '사용자') AS nickname
                FROM board_post bp
                LEFT JOIN account_user au ON au.user_id = bp.author_user_id
                WHERE bp.visibility_status = 'visible'
                  AND bp.is_notice = 1
                ORDER BY bp.is_pinned_notice DESC, datetime(bp.created_at) DESC
                LIMIT ? OFFSET ?
                """,
                (resolved_limit + 1, offset),
            ).fetchall()

            has_more = len(rows) > resolved_limit
            visible_rows = rows[:resolved_limit]
            items = [self._build_board_item(conn, row, user_id) for row in visible_rows]

            return BoardListResponse(
                items=items,
                next_cursor=str(offset + resolved_limit) if has_more else None,
                pinned_notice=None,
            )

    def list_board_bookmarks(
        self,
        user_id: str,
        cursor: str | None,
        limit: int,
    ) -> BoardListResponse:
        offset = self._parse_cursor(cursor)
        resolved_limit = self._normalize_limit(limit)

        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT bp.*,
                       COALESCE(NULLIF(au.nickname, ''), NULLIF(au.coach_name, ''), '사용자') AS nickname
                FROM board_bookmark bb
                JOIN board_post bp ON bp.post_id = bb.post_id
                LEFT JOIN account_user au ON au.user_id = bp.author_user_id
                WHERE bb.user_id = ?
                  AND bp.visibility_status = 'visible'
                ORDER BY datetime(bb.created_at) DESC
                LIMIT ? OFFSET ?
                """,
                (user_id, resolved_limit + 1, offset),
            ).fetchall()

            has_more = len(rows) > resolved_limit
            visible_rows = rows[:resolved_limit]
            items = [self._build_board_item(conn, row, user_id) for row in visible_rows]

            return BoardListResponse(
                items=items,
                next_cursor=str(offset + resolved_limit) if has_more else None,
                pinned_notice=None,
            )

    def _upsert_tag(self, conn: sqlite3.Connection, tag_name: str) -> str:
        existing = conn.execute(
            "SELECT tag_id FROM board_tag WHERE tag_name = ?",
            (tag_name,),
        ).fetchone()
        if existing:
            return str(existing["tag_id"])

        tag_id = f"tag_{uuid.uuid4().hex}"
        conn.execute(
            "INSERT INTO board_tag (tag_id, tag_name) VALUES (?, ?)",
            (tag_id, tag_name),
        )
        return tag_id

    def create_board_post(
        self,
        user_id: str,
        payload: BoardPostCreateRequest,
    ) -> BoardFeedItem:
        title = (payload.title or "").strip() or None
        body_text = self._validate_post_body(payload.body_text)
        now = self._now_iso()

        with self._connect() as conn:
            post_id = f"pst_{uuid.uuid4().hex}"
            feed_public_id = self._next_feed_public_id(conn)

            conn.execute(
                """
                INSERT INTO board_post (
                  post_id,
                  feed_public_id,
                  author_user_id,
                  title,
                  display_title,
                  body_text,
                  body_preview,
                  is_anonymous,
                  is_notice,
                  is_pinned_notice,
                  visibility_status,
                  moderation_status,
                  created_at,
                  updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    post_id,
                    feed_public_id,
                    user_id,
                    title,
                    title,
                    body_text,
                    self._preview_text(body_text),
                    int(payload.is_anonymous),
                    int(payload.is_notice),
                    int(payload.is_pinned_notice),
                    BoardVisibilityStatus.visible.value,
                    BoardModerationStatus.clear.value,
                    now,
                    now,
                ),
            )

            unique_tags = [tag.strip() for tag in payload.tag_ids if tag.strip()]
            for tag_name in sorted(set(unique_tags)):
                tag_id = self._upsert_tag(conn, tag_name)
                conn.execute(
                    "INSERT OR IGNORE INTO board_post_tag (post_id, tag_id) VALUES (?, ?)",
                    (post_id, tag_id),
                )

            for index, image_url in enumerate(payload.image_urls):
                conn.execute(
                    """
                    INSERT INTO board_post_image (image_id, post_id, image_url, display_order)
                    VALUES (?, ?, ?, ?)
                    """,
                    (f"img_{uuid.uuid4().hex}", post_id, image_url, index),
                )

            queue_types = self._detect_text_queue_types(body_text)
            for queue_type in queue_types:
                self._insert_moderation_queue(
                    conn,
                    queue_type=queue_type,
                    target_type="post",
                    target_id=post_id,
                    source_type="model_text_scan",
                    reason_code=None,
                    detail_text=None,
                    confidence=0.72 if queue_type == ModerationQueueType.hate else 0.81,
                )

            if queue_types:
                conn.execute(
                    """
                    UPDATE board_post
                    SET moderation_status = ?, updated_at = ?
                    WHERE post_id = ?
                    """,
                    (BoardModerationStatus.under_review.value, now, post_id),
                )

            conn.commit()

            row = conn.execute(
                """
                SELECT bp.*,
                       COALESCE(NULLIF(au.nickname, ''), NULLIF(au.coach_name, ''), '사용자') AS nickname
                FROM board_post bp
                LEFT JOIN account_user au ON au.user_id = bp.author_user_id
                WHERE bp.post_id = ?
                """,
                (post_id,),
            ).fetchone()
            if not row:
                raise ValueError("post_not_found")
            return self._build_board_item(conn, row, user_id)

    def update_board_post(
        self,
        user_id: str,
        post_id: str,
        payload: BoardPostUpdateRequest,
    ) -> BoardFeedItem:
        title = (payload.title or "").strip() or None
        body_text = self._validate_post_body(payload.body_text)

        now = self._now_iso()

        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT author_user_id, visibility_status
                FROM board_post
                WHERE post_id = ?
                """,
                (post_id,),
            ).fetchone()
            if not row or str(row["visibility_status"]) == BoardVisibilityStatus.deleted.value:
                raise ValueError("post_not_found")
            if str(row["author_user_id"]) != user_id:
                raise ValueError("post_edit_forbidden")

            queue_types = self._detect_text_queue_types(body_text)
            moderation_status = (
                BoardModerationStatus.under_review.value
                if queue_types
                else BoardModerationStatus.clear.value
            )

            conn.execute(
                """
                UPDATE board_post
                SET title = ?,
                    display_title = ?,
                    body_text = ?,
                    body_preview = ?,
                    moderation_status = ?,
                    updated_at = ?
                WHERE post_id = ?
                """,
                (
                    title,
                    title,
                    body_text,
                    self._preview_text(body_text),
                    moderation_status,
                    now,
                    post_id,
                ),
            )

            for queue_type in queue_types:
                self._insert_moderation_queue(
                    conn,
                    queue_type=queue_type,
                    target_type="post",
                    target_id=post_id,
                    source_type="model_text_scan",
                    reason_code=None,
                    detail_text=None,
                    confidence=0.72 if queue_type == ModerationQueueType.hate else 0.81,
                )

            conn.commit()

            updated_row = conn.execute(
                """
                SELECT bp.*,
                       COALESCE(NULLIF(au.nickname, ''), NULLIF(au.coach_name, ''), '사용자') AS nickname
                FROM board_post bp
                LEFT JOIN account_user au ON au.user_id = bp.author_user_id
                WHERE bp.post_id = ?
                """,
                (post_id,),
            ).fetchone()
            if not updated_row:
                raise ValueError("post_not_found")
            return self._build_board_item(conn, updated_row, user_id)

    def delete_board_post(self, user_id: str, post_id: str) -> BoardToggleResponse:
        now = self._now_iso()
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT author_user_id, visibility_status
                FROM board_post
                WHERE post_id = ?
                """,
                (post_id,),
            ).fetchone()
            if not row or str(row["visibility_status"]) == BoardVisibilityStatus.deleted.value:
                raise ValueError("post_not_found")
            if str(row["author_user_id"]) != user_id:
                raise ValueError("post_delete_forbidden")

            conn.execute(
                """
                UPDATE board_post
                SET visibility_status = ?,
                    updated_at = ?
                WHERE post_id = ?
                """,
                (BoardVisibilityStatus.deleted.value, now, post_id),
            )
            conn.commit()

        return BoardToggleResponse(result="deleted")

    def _ensure_post_exists(self, conn: sqlite3.Connection, post_id: str) -> None:
        row = conn.execute(
            "SELECT 1 FROM board_post WHERE post_id = ? AND visibility_status != 'deleted'",
            (post_id,),
        ).fetchone()
        if not row:
            raise ValueError("post_not_found")

    def toggle_post_like(self, user_id: str, post_id: str) -> BoardToggleResponse:
        with self._connect() as conn:
            self._ensure_post_exists(conn, post_id)
            existing = conn.execute(
                "SELECT 1 FROM board_like WHERE post_id = ? AND user_id = ?",
                (post_id, user_id),
            ).fetchone()

            if existing:
                conn.execute(
                    "DELETE FROM board_like WHERE post_id = ? AND user_id = ?",
                    (post_id, user_id),
                )
                result = "unliked"
            else:
                conn.execute(
                    "INSERT INTO board_like (post_id, user_id, created_at) VALUES (?, ?, ?)",
                    (post_id, user_id, self._now_iso()),
                )
                result = "liked"

            conn.commit()
            return BoardToggleResponse(result=result)

    def toggle_post_bookmark(self, user_id: str, post_id: str) -> BoardToggleResponse:
        with self._connect() as conn:
            self._ensure_post_exists(conn, post_id)
            existing = conn.execute(
                "SELECT 1 FROM board_bookmark WHERE post_id = ? AND user_id = ?",
                (post_id, user_id),
            ).fetchone()

            if existing:
                conn.execute(
                    "DELETE FROM board_bookmark WHERE post_id = ? AND user_id = ?",
                    (post_id, user_id),
                )
                result = "unbookmarked"
            else:
                conn.execute(
                    "INSERT INTO board_bookmark (post_id, user_id, created_at) VALUES (?, ?, ?)",
                    (post_id, user_id, self._now_iso()),
                )
                result = "bookmarked"

            conn.commit()
            return BoardToggleResponse(result=result)

    def create_post_comment(
        self,
        user_id: str,
        post_id: str,
        payload: BoardCommentCreateRequest,
    ) -> BoardCommentPayload:
        now = self._now_iso()
        with self._connect() as conn:
            self._ensure_post_exists(conn, post_id)

            comment_id = f"cmt_{uuid.uuid4().hex}"
            conn.execute(
                """
                INSERT INTO board_comment (
                  comment_id,
                  post_id,
                  author_user_id,
                  body_text,
                  is_anonymous,
                  visibility_status,
                  created_at,
                  updated_at
                ) VALUES (?, ?, ?, ?, ?, 'visible', ?, ?)
                """,
                (
                    comment_id,
                    post_id,
                    user_id,
                    payload.body_text,
                    int(payload.is_anonymous),
                    now,
                    now,
                ),
            )

            queue_types = self._detect_text_queue_types(payload.body_text)
            for queue_type in queue_types:
                self._insert_moderation_queue(
                    conn,
                    queue_type=queue_type,
                    target_type="comment",
                    target_id=comment_id,
                    source_type="model_text_scan",
                    reason_code=None,
                    detail_text=None,
                    confidence=0.69 if queue_type == ModerationQueueType.hate else 0.78,
                )

            conn.commit()

            return BoardCommentPayload(
                comment_id=comment_id,
                post_id=post_id,
                author_user_id=user_id,
                body_text=payload.body_text,
                is_anonymous=payload.is_anonymous,
                visibility_status="visible",
                created_at=datetime.fromisoformat(now),
                updated_at=datetime.fromisoformat(now),
            )

    def list_post_comments(
        self,
        viewer_user_id: str,
        post_id: str,
        limit: int = 30,
    ) -> list[BoardCommentListItem]:
        resolved_limit = max(1, min(100, limit))

        with self._connect() as conn:
            self._ensure_post_exists(conn, post_id)
            rows = conn.execute(
                """
                SELECT bc.*,
                       COALESCE(NULLIF(au.nickname, ''), NULLIF(au.coach_name, ''), '사용자') AS nickname
                FROM board_comment bc
                LEFT JOIN account_user au ON au.user_id = bc.author_user_id
                WHERE bc.post_id = ?
                  AND bc.visibility_status = 'visible'
                ORDER BY datetime(bc.created_at) ASC, bc.comment_id ASC
                LIMIT ?
                """,
                (post_id, resolved_limit),
            ).fetchall()

            items: list[BoardCommentListItem] = []
            for row in rows:
                author_user_id = str(row["author_user_id"])
                nickname = str(row["nickname"]) if row["nickname"] else "사용자"
                is_anonymous = bool(row["is_anonymous"])

                display_name = nickname
                if is_anonymous and author_user_id != viewer_user_id:
                    display_name = "익명"

                items.append(
                    BoardCommentListItem(
                        comment_id=str(row["comment_id"]),
                        post_id=str(row["post_id"]),
                        author_user_id=author_user_id,
                        author_display_name=display_name,
                        body_text=str(row["body_text"]),
                        is_anonymous=is_anonymous,
                        visibility_status=str(row["visibility_status"]),
                        created_at=datetime.fromisoformat(str(row["created_at"])),
                        updated_at=(
                            datetime.fromisoformat(str(row["updated_at"]))
                            if row["updated_at"]
                            else None
                        ),
                    )
                )

            return items

    def report_post(
        self,
        user_id: str,
        post_id: str,
        payload: BoardReportRequest,
    ) -> BoardToggleResponse:
        now = self._now_iso()

        with self._connect() as conn:
            self._ensure_post_exists(conn, post_id)
            already_reported = conn.execute(
                """
                SELECT 1
                FROM board_report
                WHERE target_type = 'post' AND target_id = ? AND reporter_user_id = ?
                LIMIT 1
                """,
                (post_id, user_id),
            ).fetchone()
            if already_reported is not None:
                raise ValueError("already_reported")

            conn.execute(
                """
                INSERT INTO board_report (
                  report_id,
                  target_type,
                  target_id,
                  reporter_user_id,
                  reason_code,
                  detail_text,
                  created_at,
                  review_status
                ) VALUES (?, 'post', ?, ?, ?, ?, ?, 'queued')
                """,
                (
                    f"rpt_{uuid.uuid4().hex}",
                    post_id,
                    user_id,
                    payload.reason_code.value,
                    payload.detail_text,
                    now,
                ),
            )

            self._insert_moderation_queue(
                conn,
                queue_type=ModerationQueueType.report,
                target_type="post",
                target_id=post_id,
                source_type="report",
                reason_code=payload.reason_code.value,
                detail_text=payload.detail_text,
                confidence=None,
            )

            if payload.reason_code in {
                BoardReportReasonCode.self_harm_signal,
                BoardReportReasonCode.violence_signal,
                BoardReportReasonCode.threat,
            }:
                self._insert_moderation_queue(
                    conn,
                    queue_type=ModerationQueueType.safety,
                    target_type="post",
                    target_id=post_id,
                    source_type="report",
                    reason_code=payload.reason_code.value,
                    detail_text=payload.detail_text,
                    confidence=0.92,
                )

            if payload.reason_code in {
                BoardReportReasonCode.hate,
                BoardReportReasonCode.abuse,
                BoardReportReasonCode.sexual_harassment,
            }:
                self._insert_moderation_queue(
                    conn,
                    queue_type=ModerationQueueType.hate,
                    target_type="post",
                    target_id=post_id,
                    source_type="report",
                    reason_code=payload.reason_code.value,
                    detail_text=payload.detail_text,
                    confidence=0.74,
                )

            conn.execute(
                """
                UPDATE board_post
                SET moderation_status = ?, updated_at = ?
                WHERE post_id = ?
                """,
                (BoardModerationStatus.under_review.value, now, post_id),
            )
            conn.commit()

        return BoardToggleResponse(result="reported")

    def list_moderation_queues(self, limit: int = 20) -> ModerationQueuesResponse:
        resolved_limit = max(1, min(100, limit))

        with self._connect() as conn:
            groups: list[ModerationQueueGroup] = []
            for queue_type in [
                ModerationQueueType.report,
                ModerationQueueType.hate,
                ModerationQueueType.safety,
            ]:
                count_row = conn.execute(
                    """
                    SELECT COUNT(*) AS cnt
                    FROM board_moderation_queue
                    WHERE queue_type = ?
                      AND status = 'queued'
                    """,
                    (queue_type.value,),
                ).fetchone()
                queued_count = int(count_row["cnt"] or 0)

                rows = conn.execute(
                    """
                    SELECT
                      queue_item_id,
                      queue_type,
                      target_type,
                      target_id,
                      source_type,
                      reason_code,
                      detail_text,
                      confidence,
                      status,
                      created_at
                    FROM board_moderation_queue
                    WHERE queue_type = ?
                      AND status = 'queued'
                    ORDER BY datetime(created_at) DESC
                    LIMIT ?
                    """,
                    (queue_type.value, resolved_limit),
                ).fetchall()

                items = [
                    ModerationQueueItem(
                        queue_item_id=str(row["queue_item_id"]),
                        queue_type=ModerationQueueType(str(row["queue_type"])),
                        target_type=str(row["target_type"]),
                        target_id=str(row["target_id"]),
                        source_type=str(row["source_type"]),
                        reason_code=(str(row["reason_code"]) if row["reason_code"] else None),
                        detail_text=(str(row["detail_text"]) if row["detail_text"] else None),
                        confidence=(
                            float(row["confidence"]) if row["confidence"] is not None else None
                        ),
                        status=str(row["status"]),
                        created_at=datetime.fromisoformat(str(row["created_at"])),
                    )
                    for row in rows
                ]
                groups.append(
                    ModerationQueueGroup(
                        queue_type=queue_type,
                        queued_count=queued_count,
                        items=items,
                    )
                )

            return ModerationQueuesResponse(groups=groups)

    @staticmethod
    def _support_priority_and_sensitive(
        title: str,
        category: str,
        body: str,
    ) -> tuple[SupportTicketPriority, bool]:
        merged = f"{title} {category} {body}".lower()

        if any(token.lower() in merged for token in SUPPORT_URGENT_KEYWORDS):
            return SupportTicketPriority.urgent, True
        if any(token.lower() in merged for token in SUPPORT_IMPORTANT_KEYWORDS):
            sensitive = any(token.lower() in merged for token in SUPPORT_SENSITIVE_KEYWORDS)
            return SupportTicketPriority.important, sensitive

        sensitive = any(token.lower() in merged for token in SUPPORT_SENSITIVE_KEYWORDS)
        return SupportTicketPriority.normal, sensitive

    @staticmethod
    def _support_ticket_from_row(row: sqlite3.Row) -> SupportTicketPayload:
        return SupportTicketPayload(
            ticket_id=str(row["ticket_id"]),
            user_id=str(row["user_id"]),
            ticket_type=str(row["ticket_type"]),
            title=str(row["title"]),
            status=SupportTicketStatus(str(row["status"])),
            category=str(row["category"]),
            related_feature=(str(row["related_feature"]) if row["related_feature"] else None),
            priority=SupportTicketPriority(str(row["priority"])),
            reply_requested=bool(row["reply_requested"]),
            sensitive_queue_flag=bool(row["sensitive_queue_flag"]),
            created_at=datetime.fromisoformat(str(row["created_at"])),
            updated_at=datetime.fromisoformat(str(row["updated_at"])),
            resolved_at=(
                datetime.fromisoformat(str(row["resolved_at"])) if row["resolved_at"] else None
            ),
            closed_at=(
                datetime.fromisoformat(str(row["closed_at"])) if row["closed_at"] else None
            ),
        )

    @staticmethod
    def _support_message_from_row(row: sqlite3.Row) -> SupportMessagePayload:
        return SupportMessagePayload(
            message_id=str(row["message_id"]),
            ticket_id=str(row["ticket_id"]),
            author_type=SupportMessageAuthorType(str(row["author_type"])),
            author_id=(str(row["author_id"]) if row["author_id"] else None),
            body=str(row["body"]),
            created_at=datetime.fromisoformat(str(row["created_at"])),
            is_followup=bool(row["is_followup"]),
            internal_only=bool(row["internal_only"]),
        )

    @staticmethod
    def _support_notification_from_row(row: sqlite3.Row) -> SupportNotificationPayload:
        return SupportNotificationPayload(
            notification_id=str(row["notification_id"]),
            recipient_type=str(row["recipient_type"]),
            recipient_id=str(row["recipient_id"]),
            ticket_id=str(row["ticket_id"]),
            event_type=str(row["event_type"]),
            is_read=bool(row["is_read"]),
            created_at=datetime.fromisoformat(str(row["created_at"])),
            read_at=(datetime.fromisoformat(str(row["read_at"])) if row["read_at"] else None),
        )

    def _insert_support_notification(
        self,
        conn: sqlite3.Connection,
        *,
        recipient_type: str,
        recipient_id: str,
        ticket_id: str,
        event_type: str,
    ) -> None:
        conn.execute(
            """
            INSERT INTO support_notification (
              notification_id,
              recipient_type,
              recipient_id,
              ticket_id,
              event_type,
              is_read,
              created_at,
              read_at
            ) VALUES (?, ?, ?, ?, ?, 0, ?, NULL)
            """,
            (
                f"ntf_{uuid.uuid4().hex}",
                recipient_type,
                recipient_id,
                ticket_id,
                event_type,
                self._now_iso(),
            ),
        )

    def _insert_support_status_history(
        self,
        conn: sqlite3.Connection,
        *,
        ticket_id: str,
        old_status: str | None,
        new_status: str,
        changed_by_type: str,
        changed_by_id: str | None,
        note: str | None,
    ) -> None:
        conn.execute(
            """
            INSERT INTO support_status_history (
              history_id,
              ticket_id,
              old_status,
              new_status,
              changed_by_type,
              changed_by_id,
              note,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"sth_{uuid.uuid4().hex}",
                ticket_id,
                old_status,
                new_status,
                changed_by_type,
                changed_by_id,
                note,
                self._now_iso(),
            ),
        )

    def _load_ticket_for_user(
        self,
        conn: sqlite3.Connection,
        user_id: str,
        ticket_id: str,
    ) -> sqlite3.Row:
        row = conn.execute(
            "SELECT * FROM support_ticket WHERE ticket_id = ? AND user_id = ?",
            (ticket_id, user_id),
        ).fetchone()
        if not row:
            raise ValueError("ticket_not_found")
        return row

    def create_support_ticket(
        self,
        user_id: str,
        payload: SupportTicketCreateRequest,
    ) -> SupportTicketDetailResponse:
        now = self._now_iso()
        priority, sensitive = self._support_priority_and_sensitive(
            payload.title,
            payload.category,
            payload.body,
        )

        with self._connect() as conn:
            ticket_id = f"tkt_{uuid.uuid4().hex}"
            message_id = f"msg_{uuid.uuid4().hex}"

            conn.execute(
                """
                INSERT INTO support_ticket (
                  ticket_id,
                  user_id,
                  ticket_type,
                  title,
                  category,
                  related_feature,
                  reply_requested,
                  status,
                  priority,
                  sensitive_queue_flag,
                  created_at,
                  updated_at,
                  resolved_at,
                  closed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
                """,
                (
                    ticket_id,
                    user_id,
                    payload.ticket_type.value,
                    payload.title,
                    payload.category,
                    payload.related_feature,
                    int(payload.reply_requested),
                    SupportTicketStatus.new.value,
                    priority.value,
                    int(sensitive),
                    now,
                    now,
                ),
            )

            conn.execute(
                """
                INSERT INTO support_message (
                  message_id,
                  ticket_id,
                  author_type,
                  author_id,
                  body,
                  is_followup,
                  internal_only,
                  created_at
                ) VALUES (?, ?, 'user', ?, ?, 0, 0, ?)
                """,
                (message_id, ticket_id, user_id, payload.body, now),
            )

            self._insert_support_status_history(
                conn,
                ticket_id=ticket_id,
                old_status=None,
                new_status=SupportTicketStatus.new.value,
                changed_by_type="user",
                changed_by_id=user_id,
                note="ticket_created",
            )
            self._insert_support_notification(
                conn,
                recipient_type="admin",
                recipient_id="admin_queue",
                ticket_id=ticket_id,
                event_type="new_ticket",
            )
            if sensitive:
                self._insert_support_notification(
                    conn,
                    recipient_type="admin",
                    recipient_id="admin_queue",
                    ticket_id=ticket_id,
                    event_type="sensitive_flag",
                )

            conn.commit()

        return self.get_support_ticket_detail(user_id, ticket_id)

    def list_support_tickets(
        self,
        user_id: str,
        status: SupportTicketStatus | None,
        limit: int,
    ) -> list[SupportTicketListItem]:
        resolved_limit = max(1, min(100, limit))

        with self._connect() as conn:
            if status is None:
                rows = conn.execute(
                    """
                    SELECT *
                    FROM support_ticket
                    WHERE user_id = ?
                    ORDER BY datetime(updated_at) DESC
                    LIMIT ?
                    """,
                    (user_id, resolved_limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT *
                    FROM support_ticket
                    WHERE user_id = ? AND status = ?
                    ORDER BY datetime(updated_at) DESC
                    LIMIT ?
                    """,
                    (user_id, status.value, resolved_limit),
                ).fetchall()

            items: list[SupportTicketListItem] = []
            for row in rows:
                message_row = conn.execute(
                    """
                    SELECT body, created_at
                    FROM support_message
                    WHERE ticket_id = ?
                      AND internal_only = 0
                    ORDER BY datetime(created_at) DESC
                    LIMIT 1
                    """,
                    (str(row["ticket_id"]),),
                ).fetchone()

                preview = None
                latest_message_at = None
                if message_row:
                    preview = self._preview_text(str(message_row["body"]), max_chars=80)
                    latest_message_at = datetime.fromisoformat(str(message_row["created_at"]))

                items.append(
                    SupportTicketListItem(
                        ticket=self._support_ticket_from_row(row),
                        latest_message_at=latest_message_at,
                        latest_message_preview=preview,
                    )
                )

            return items

    def get_support_ticket_detail(
        self,
        user_id: str,
        ticket_id: str,
    ) -> SupportTicketDetailResponse:
        with self._connect() as conn:
            ticket_row = self._load_ticket_for_user(conn, user_id, ticket_id)

            message_rows = conn.execute(
                """
                SELECT *
                FROM support_message
                WHERE ticket_id = ?
                  AND internal_only = 0
                ORDER BY datetime(created_at) ASC
                """,
                (ticket_id,),
            ).fetchall()
            notification_rows = conn.execute(
                """
                SELECT *
                FROM support_notification
                WHERE recipient_type = 'user'
                  AND recipient_id = ?
                  AND ticket_id = ?
                ORDER BY datetime(created_at) DESC
                """,
                (user_id, ticket_id),
            ).fetchall()

            return SupportTicketDetailResponse(
                ticket=self._support_ticket_from_row(ticket_row),
                messages=[self._support_message_from_row(row) for row in message_rows],
                notifications=[
                    self._support_notification_from_row(row) for row in notification_rows
                ],
            )

    def _set_ticket_status(
        self,
        conn: sqlite3.Connection,
        *,
        ticket_row: sqlite3.Row,
        new_status: SupportTicketStatus,
        changed_by_type: str,
        changed_by_id: str | None,
        note: str | None,
        notify_user: bool,
    ) -> None:
        ticket_id = str(ticket_row["ticket_id"])
        user_id = str(ticket_row["user_id"])
        old_status = str(ticket_row["status"])
        now = self._now_iso()

        resolved_at = ticket_row["resolved_at"]
        closed_at = ticket_row["closed_at"]

        if new_status == SupportTicketStatus.resolved:
            resolved_at = now
        if new_status == SupportTicketStatus.closed:
            closed_at = now

        conn.execute(
            """
            UPDATE support_ticket
            SET status = ?,
                updated_at = ?,
                resolved_at = ?,
                closed_at = ?
            WHERE ticket_id = ?
            """,
            (new_status.value, now, resolved_at, closed_at, ticket_id),
        )

        self._insert_support_status_history(
            conn,
            ticket_id=ticket_id,
            old_status=old_status,
            new_status=new_status.value,
            changed_by_type=changed_by_type,
            changed_by_id=changed_by_id,
            note=note,
        )

        if notify_user:
            self._insert_support_notification(
                conn,
                recipient_type="user",
                recipient_id=user_id,
                ticket_id=ticket_id,
                event_type="status_changed",
            )

    def add_support_followup(
        self,
        user_id: str,
        ticket_id: str,
        payload: SupportFollowupRequest,
    ) -> SupportTicketDetailResponse:
        now = self._now_iso()

        with self._connect() as conn:
            ticket_row = self._load_ticket_for_user(conn, user_id, ticket_id)
            if str(ticket_row["status"]) == SupportTicketStatus.closed.value:
                raise ValueError("ticket_closed")

            conn.execute(
                """
                INSERT INTO support_message (
                  message_id,
                  ticket_id,
                  author_type,
                  author_id,
                  body,
                  is_followup,
                  internal_only,
                  created_at
                ) VALUES (?, ?, 'user', ?, ?, 1, 0, ?)
                """,
                (f"msg_{uuid.uuid4().hex}", ticket_id, user_id, payload.body, now),
            )

            self._set_ticket_status(
                conn,
                ticket_row=ticket_row,
                new_status=SupportTicketStatus.reopened,
                changed_by_type="user",
                changed_by_id=user_id,
                note="user_followup",
                notify_user=False,
            )
            self._insert_support_notification(
                conn,
                recipient_type="admin",
                recipient_id="admin_queue",
                ticket_id=ticket_id,
                event_type="user_followup",
            )

            conn.commit()

        return self.get_support_ticket_detail(user_id, ticket_id)

    def resolve_support_ticket(
        self,
        user_id: str,
        ticket_id: str,
    ) -> SupportResolveResponse:
        with self._connect() as conn:
            ticket_row = self._load_ticket_for_user(conn, user_id, ticket_id)
            self._set_ticket_status(
                conn,
                ticket_row=ticket_row,
                new_status=SupportTicketStatus.resolved,
                changed_by_type="user",
                changed_by_id=user_id,
                note="user_resolved",
                notify_user=False,
            )
            conn.commit()

        return SupportResolveResponse(result="resolved", status=SupportTicketStatus.resolved)

    def add_admin_reply(
        self,
        ticket_id: str,
        payload: SupportAdminReplyRequest,
        actor_user_id: str,
    ) -> SupportTicketDetailResponse:
        now = self._now_iso()

        with self._connect() as conn:
            ticket_row = conn.execute(
                "SELECT * FROM support_ticket WHERE ticket_id = ?",
                (ticket_id,),
            ).fetchone()
            if not ticket_row:
                raise ValueError("ticket_not_found")

            user_id = str(ticket_row["user_id"])
            conn.execute(
                """
                INSERT INTO support_message (
                  message_id,
                  ticket_id,
                  author_type,
                  author_id,
                  body,
                  is_followup,
                  internal_only,
                  created_at
                ) VALUES (?, ?, 'admin', ?, ?, 0, 0, ?)
                """,
                (f"msg_{uuid.uuid4().hex}", ticket_id, actor_user_id, payload.body, now),
            )

            self._set_ticket_status(
                conn,
                ticket_row=ticket_row,
                new_status=payload.status,
                changed_by_type="admin",
                changed_by_id=actor_user_id,
                note="admin_reply",
                notify_user=True,
            )
            self._insert_support_notification(
                conn,
                recipient_type="user",
                recipient_id=user_id,
                ticket_id=ticket_id,
                event_type="admin_reply",
            )

            conn.commit()

        return self.get_support_ticket_detail(user_id, ticket_id)

    def list_support_notifications(
        self,
        user_id: str,
        unread_only: bool,
        limit: int,
    ) -> SupportNotificationListResponse:
        resolved_limit = max(1, min(100, limit))

        with self._connect() as conn:
            where_clause = ""
            params: list[object] = [user_id]
            if unread_only:
                where_clause = " AND is_read = 0"

            rows = conn.execute(
                """
                SELECT *
                FROM support_notification
                WHERE recipient_type = 'user'
                  AND recipient_id = ?
                """
                + where_clause
                + " ORDER BY datetime(created_at) DESC LIMIT ?",
                (*params, resolved_limit),
            ).fetchall()

            return SupportNotificationListResponse(
                items=[self._support_notification_from_row(row) for row in rows]
            )

    def mark_support_notification_read(
        self,
        user_id: str,
        notification_id: str,
    ) -> SupportNotificationPayload:
        now = self._now_iso()
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT *
                FROM support_notification
                WHERE notification_id = ?
                  AND recipient_type = 'user'
                  AND recipient_id = ?
                """,
                (notification_id, user_id),
            ).fetchone()
            if not row:
                raise ValueError("notification_not_found")

            conn.execute(
                """
                UPDATE support_notification
                SET is_read = 1,
                    read_at = ?
                WHERE notification_id = ?
                """,
                (now, notification_id),
            )
            conn.commit()

            updated = conn.execute(
                "SELECT * FROM support_notification WHERE notification_id = ?",
                (notification_id,),
            ).fetchone()
            if not updated:
                raise ValueError("notification_not_found")
            return self._support_notification_from_row(updated)

    def get_support_queue_summary(self) -> SupportQueueSummaryResponse:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT status, COUNT(*) AS cnt
                FROM support_ticket
                WHERE status IN ('new', 'waiting_admin', 'reopened', 'in_progress')
                GROUP BY status
                """
            ).fetchall()
            status_counts = {str(row["status"]): int(row["cnt"] or 0) for row in rows}

            urgent_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM support_ticket
                WHERE status IN ('new', 'waiting_admin', 'reopened', 'in_progress')
                  AND priority = 'urgent'
                """
            ).fetchone()
            sensitive_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM support_ticket
                WHERE status IN ('new', 'waiting_admin', 'reopened', 'in_progress')
                  AND sensitive_queue_flag = 1
                """
            ).fetchone()

            return SupportQueueSummaryResponse(
                status_counts=status_counts,
                urgent_count=int(urgent_row["cnt"] or 0),
                sensitive_count=int(sensitive_row["cnt"] or 0),
            )

    @staticmethod
    def _mask_email(email: str) -> str:
        local, at, domain = email.partition("@")
        if not at:
            return "***"
        if len(local) <= 2:
            masked_local = f"{local[0]}*" if local else "*"
        else:
            masked_local = f"{local[:2]}***"
        return f"{masked_local}@{domain}"

    def _latest_consents(self, conn: sqlite3.Connection, user_id: str) -> dict[str, bool]:
        rows = conn.execute(
            """
            SELECT consent_type, consent_value, captured_at
            FROM account_consent
            WHERE user_id = ?
            ORDER BY datetime(captured_at) DESC
            """,
            (user_id,),
        ).fetchall()

        latest: dict[str, bool] = {}
        for row in rows:
            consent_type = str(row["consent_type"])
            if consent_type in latest:
                continue
            latest[consent_type] = bool(row["consent_value"])
        return latest

    def get_mypage_home(self, user_id: str) -> MyPageHomeResponse:
        today = date.today()
        start_7d = today - timedelta(days=6)

        with self._connect() as conn:
            account_row = conn.execute(
                """
                SELECT
                  au.user_id,
                  au.nickname,
                  au.coach_name,
                  au.email,
                  au.email_verified,
                  au.created_at,
                  ap.birth_year,
                  ap.gender
                FROM account_user au
                LEFT JOIN account_profile ap ON ap.user_id = au.user_id
                WHERE au.user_id = ?
                """,
                (user_id,),
            ).fetchone()
            if not account_row:
                raise ValueError("account_not_found")

            checkin_days_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM daily_checkin
                WHERE user_id = ?
                  AND status = 'submitted'
                  AND date BETWEEN ? AND ?
                """,
                (user_id, start_7d.isoformat(), today.isoformat()),
            ).fetchone()

            challenge_active_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM challenge_enrollment
                WHERE user_id = ? AND status = 'active'
                """,
                (user_id,),
            ).fetchone()

            challenge_completed_row = conn.execute(
                """
                SELECT COUNT(DISTINCT date) AS cnt
                FROM challenge_day_log
                WHERE user_id = ?
                  AND completed_flag = 1
                  AND date BETWEEN ? AND ?
                """,
                (user_id, start_7d.isoformat(), today.isoformat()),
            ).fetchone()

            cbt_sessions = 0
            if self._table_exists(conn, "cbt_session_summary"):
                cbt_row = conn.execute(
                    """
                    SELECT COUNT(*) AS cnt
                    FROM cbt_session_summary
                    WHERE user_id = ?
                      AND date BETWEEN ? AND ?
                    """,
                    (user_id, start_7d.isoformat(), today.isoformat()),
                ).fetchone()
                cbt_sessions = int(cbt_row["cnt"] or 0)

            journal_days_row = conn.execute(
                """
                SELECT COUNT(DISTINCT entry_date) AS cnt
                FROM journal_entry
                WHERE user_id = ?
                  AND status = 'active'
                  AND entry_date BETWEEN ? AND ?
                """,
                (user_id, start_7d.isoformat(), today.isoformat()),
            ).fetchone()

            latest_assessment_row = conn.execute(
                """
                SELECT completed_at
                FROM periodic_assessment
                WHERE user_id = ?
                  AND status IN ('completed', 'late')
                  AND completed_at IS NOT NULL
                ORDER BY datetime(completed_at) DESC
                LIMIT 1
                """,
                (user_id,),
            ).fetchone()

            waiting_user_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM support_ticket
                WHERE user_id = ? AND status = 'waiting_user'
                """,
                (user_id,),
            ).fetchone()
            answered_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM support_ticket
                WHERE user_id = ? AND status = 'answered'
                """,
                (user_id,),
            ).fetchone()
            reopened_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM support_ticket
                WHERE user_id = ? AND status = 'reopened'
                """,
                (user_id,),
            ).fetchone()

            vault_count = 0
            recent_reports: list[MyPageReportVaultItem] = []
            if self._table_exists(conn, "report_export_vault"):
                vault_count_row = conn.execute(
                    "SELECT COUNT(*) AS cnt FROM report_export_vault WHERE user_id = ?",
                    (user_id,),
                ).fetchone()
                vault_count = int(vault_count_row["cnt"] or 0)

                report_rows = conn.execute(
                    """
                    SELECT report_id, created_at, period_start, period_end, format, file_name
                    FROM report_export_vault
                    WHERE user_id = ?
                    ORDER BY datetime(created_at) DESC
                    LIMIT 2
                    """,
                    (user_id,),
                ).fetchall()
                recent_reports = [
                    MyPageReportVaultItem(
                        report_id=str(row["report_id"]),
                        created_at=datetime.fromisoformat(str(row["created_at"])),
                        period_start=date.fromisoformat(str(row["period_start"])),
                        period_end=date.fromisoformat(str(row["period_end"])),
                        format=str(row["format"]),
                        file_name=str(row["file_name"]),
                    )
                    for row in report_rows
                ]

            return MyPageHomeResponse(
                profile=MyPageProfileSummary(
                    user_id=str(account_row["user_id"]),
                    nickname=str(account_row["nickname"]),
                    coach_name=str(account_row["coach_name"] or account_row["nickname"]),
                    email_masked=self._mask_email(str(account_row["email"])),
                    email_verified=bool(account_row["email_verified"]),
                    created_at=datetime.fromisoformat(str(account_row["created_at"])),
                    birth_year=(
                        int(account_row["birth_year"]) if account_row["birth_year"] else None
                    ),
                    gender=(str(account_row["gender"]) if account_row["gender"] else None),
                    notification_preferences={
                        "support_updates": True,
                        "service_notice": True,
                    },
                ),
                activity_summary=MyPageActivitySummary(
                    window_days=7,
                    checkin_days=int(checkin_days_row["cnt"] or 0),
                    challenge_active_count=int(challenge_active_row["cnt"] or 0),
                    challenge_completed_days=int(challenge_completed_row["cnt"] or 0),
                    cbt_sessions=cbt_sessions,
                    journal_days=int(journal_days_row["cnt"] or 0),
                    last_assessment_at=(
                        datetime.fromisoformat(str(latest_assessment_row["completed_at"]))
                        if latest_assessment_row and latest_assessment_row["completed_at"]
                        else None
                    ),
                ),
                ticket_summary=MyPageTicketSummary(
                    waiting_user_count=int(waiting_user_row["cnt"] or 0),
                    answered_count=int(answered_row["cnt"] or 0),
                    reopened_count=int(reopened_row["cnt"] or 0),
                ),
                report_summary=MyPageReportSummary(
                    vault_count=vault_count,
                    recent_reports=recent_reports,
                ),
                quick_links=[
                    MyPageQuickLink.profile,
                    MyPageQuickLink.security,
                    MyPageQuickLink.activity_log,
                    MyPageQuickLink.bookmarks,
                    MyPageQuickLink.my_posts,
                    MyPageQuickLink.my_comments,
                    MyPageQuickLink.support_tickets,
                    MyPageQuickLink.report_vault,
                    MyPageQuickLink.consents,
                ],
            )

    def update_mypage_profile(
        self,
        user_id: str,
        payload: MyPageProfileUpdateRequest,
    ) -> MyPageProfileUpdateResponse:
        current_year = datetime.now(UTC).year
        if payload.birth_year is not None and payload.birth_year > current_year:
            raise ValueError("invalid_birth_year")

        with self._connect() as conn:
            account_row = conn.execute(
                "SELECT user_id, nickname, coach_name FROM account_user WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            if not account_row:
                raise ValueError("account_not_found")

            nickname = str(account_row["nickname"])
            coach_name = str(account_row["coach_name"] or account_row["nickname"])
            if payload.nickname is not None:
                trimmed = payload.nickname.strip()
                if not trimmed:
                    raise ValueError("nickname_invalid")
                nickname = trimmed
            if payload.coach_name is not None:
                trimmed_coach = payload.coach_name.strip()
                if not trimmed_coach:
                    raise ValueError("coach_name_invalid")
                coach_name = trimmed_coach

            conn.execute(
                """
                UPDATE account_user
                SET nickname = ?, coach_name = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (nickname, coach_name, self._now_iso(), user_id),
            )

            profile_row = conn.execute(
                "SELECT birth_year, gender FROM account_profile WHERE user_id = ?",
                (user_id,),
            ).fetchone()

            birth_year = (
                payload.birth_year
                if payload.birth_year is not None
                else (
                    int(profile_row["birth_year"])
                    if profile_row and profile_row["birth_year"]
                    else None
                )
            )
            gender = (
                payload.gender
                if payload.gender is not None
                else (
                    str(profile_row["gender"])
                    if profile_row and profile_row["gender"]
                    else None
                )
            )
            age_years = (current_year - birth_year) if birth_year else None

            conn.execute(
                """
                INSERT INTO account_profile (
                  user_id,
                  birth_year,
                  gender,
                  age_years_derived,
                  profile_completed_at
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                  birth_year = excluded.birth_year,
                  gender = excluded.gender,
                  age_years_derived = excluded.age_years_derived,
                  profile_completed_at = excluded.profile_completed_at
                """,
                (user_id, birth_year, gender, age_years, self._now_iso()),
            )

            conn.commit()

            return MyPageProfileUpdateResponse(
                user_id=user_id,
                nickname=nickname,
                coach_name=coach_name,
                birth_year=birth_year,
                gender=gender,
                age_years_derived=age_years,
            )

    def request_password_change(
        self,
        user_id: str,
        payload: PasswordChangeRequest,
    ) -> PasswordChangeResponse:
        if payload.new_password != payload.new_password_confirm:
            raise ValueError("password_confirm_mismatch")
        if payload.new_password == payload.current_password:
            raise ValueError("password_reuse_forbidden")

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO mypage_security_audit (
                  audit_id,
                  user_id,
                  action_code,
                  created_at,
                  detail_json
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    f"aud_{uuid.uuid4().hex}",
                    user_id,
                    "password_change_requested",
                    self._now_iso(),
                    "{\"provider\":\"firebase_auth\"}",
                ),
            )
            conn.commit()

        return PasswordChangeResponse(
            result="password_change_requested",
            requires_firebase_action=True,
            message="Firebase 재인증/비밀번호 변경 플로우를 사용하세요.",
        )

    def list_mypage_bookmarks(self, user_id: str, limit: int) -> list[MyPagePostSummary]:
        resolved_limit = max(1, min(100, limit))
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT bp.post_id, bp.feed_public_id, bp.title, bp.body_preview, bb.created_at
                FROM board_bookmark bb
                JOIN board_post bp ON bp.post_id = bb.post_id
                WHERE bb.user_id = ?
                  AND bp.visibility_status = 'visible'
                ORDER BY datetime(bb.created_at) DESC
                LIMIT ?
                """,
                (user_id, resolved_limit),
            ).fetchall()

            return [
                MyPagePostSummary(
                    post_id=str(row["post_id"]),
                    feed_public_id=str(row["feed_public_id"]),
                    title=(str(row["title"]) if row["title"] else None),
                    body_preview=str(row["body_preview"]),
                    created_at=datetime.fromisoformat(str(row["created_at"])),
                )
                for row in rows
            ]

    def list_mypage_my_posts(self, user_id: str, limit: int) -> list[MyPagePostSummary]:
        resolved_limit = max(1, min(100, limit))
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT post_id, feed_public_id, title, body_preview, created_at
                FROM board_post
                WHERE author_user_id = ?
                  AND visibility_status != 'deleted'
                ORDER BY datetime(created_at) DESC
                LIMIT ?
                """,
                (user_id, resolved_limit),
            ).fetchall()

            return [
                MyPagePostSummary(
                    post_id=str(row["post_id"]),
                    feed_public_id=str(row["feed_public_id"]),
                    title=(str(row["title"]) if row["title"] else None),
                    body_preview=str(row["body_preview"]),
                    created_at=datetime.fromisoformat(str(row["created_at"])),
                )
                for row in rows
            ]

    def list_mypage_my_comments(
        self,
        user_id: str,
        limit: int,
    ) -> list[MyPageCommentSummary]:
        resolved_limit = max(1, min(100, limit))
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT
                  bc.comment_id,
                  bc.post_id,
                  bp.feed_public_id,
                  bp.title AS post_title,
                  bc.body_text,
                  bc.created_at
                FROM board_comment bc
                JOIN board_post bp ON bp.post_id = bc.post_id
                WHERE bc.author_user_id = ?
                  AND bc.visibility_status = 'visible'
                ORDER BY datetime(bc.created_at) DESC
                LIMIT ?
                """,
                (user_id, resolved_limit),
            ).fetchall()

            return [
                MyPageCommentSummary(
                    comment_id=str(row["comment_id"]),
                    post_id=str(row["post_id"]),
                    feed_public_id=str(row["feed_public_id"]),
                    post_title=(str(row["post_title"]) if row["post_title"] else None),
                    body_preview=self._preview_text(str(row["body_text"]), max_chars=90),
                    created_at=datetime.fromisoformat(str(row["created_at"])),
                )
                for row in rows
            ]

    def list_mypage_report_vault(
        self,
        user_id: str,
        limit: int,
    ) -> list[MyPageReportVaultItem]:
        resolved_limit = max(1, min(100, limit))

        with self._connect() as conn:
            if not self._table_exists(conn, "report_export_vault"):
                return []

            rows = conn.execute(
                """
                SELECT report_id, created_at, period_start, period_end, format, file_name
                FROM report_export_vault
                WHERE user_id = ?
                ORDER BY datetime(created_at) DESC
                LIMIT ?
                """,
                (user_id, resolved_limit),
            ).fetchall()

            return [
                MyPageReportVaultItem(
                    report_id=str(row["report_id"]),
                    created_at=datetime.fromisoformat(str(row["created_at"])),
                    period_start=date.fromisoformat(str(row["period_start"])),
                    period_end=date.fromisoformat(str(row["period_end"])),
                    format=str(row["format"]),
                    file_name=str(row["file_name"]),
                )
                for row in rows
            ]

    def delete_mypage_report_vault_item(
        self,
        user_id: str,
        report_id: str,
    ) -> BoardToggleResponse:
        with self._connect() as conn:
            if not self._table_exists(conn, "report_export_vault"):
                raise ValueError("report_not_found")

            row = conn.execute(
                """
                SELECT 1
                FROM report_export_vault
                WHERE report_id = ?
                  AND user_id = ?
                """,
                (report_id, user_id),
            ).fetchone()
            if not row:
                raise ValueError("report_not_found")

            conn.execute(
                """
                DELETE FROM report_export_vault
                WHERE report_id = ?
                  AND user_id = ?
                """,
                (report_id, user_id),
            )
            conn.commit()

        return BoardToggleResponse(result="deleted")

    def get_mypage_consents(self, user_id: str) -> MyPageConsentResponse:
        with self._connect() as conn:
            latest = self._latest_consents(conn, user_id)
            return MyPageConsentResponse(
                terms_required=bool(latest.get("terms", False)),
                privacy_required=bool(latest.get("privacy", False)),
                sensitive_data_required=bool(latest.get("sensitive_data", False)),
                personalization_optional=bool(latest.get("personalization", False)),
                model_improvement_optional=bool(latest.get("model_improvement", False)),
                marketing_optional=bool(latest.get("marketing", False)),
            )

    def update_mypage_consents(
        self,
        user_id: str,
        payload: MyPageConsentUpdateRequest,
    ) -> MyPageConsentResponse:
        updates = {
            "personalization": payload.personalization_optional,
            "model_improvement": payload.model_improvement_optional,
            "marketing": payload.marketing_optional,
        }

        with self._connect() as conn:
            for consent_type, value in updates.items():
                if value is None:
                    continue
                conn.execute(
                    """
                    INSERT INTO account_consent (
                      consent_id,
                      user_id,
                      consent_type,
                      consent_value,
                      consent_version,
                      captured_at
                    ) VALUES (?, ?, ?, ?, 'v1', ?)
                    """,
                    (
                        f"cst_{uuid.uuid4().hex}",
                        user_id,
                        consent_type,
                        int(value),
                        self._now_iso(),
                    ),
                )
            conn.commit()

        return self.get_mypage_consents(user_id)
