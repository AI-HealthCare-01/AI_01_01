from __future__ import annotations

import os
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import String, asc, cast, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import crud
from app.db.models import Assessment, BoardCategory, BoardComment, BoardPost, LoginEvent, User
from app.schemas.admin import (
    AdminAccountItem,
    AdminAccountListResponse,
    AdminAccountSearchUserItem,
    AdminAccountSearchUserListResponse,
    AdminBlockedEmailCreateRequest,
    AdminBlockedEmailItem,
    AdminBlockedEmailListResponse,
    AdminBlockedIPCreateRequest,
    AdminBlockedIPItem,
    AdminBlockedIPListResponse,
    AdminAssessmentItem,
    AdminAssessmentListResponse,
    AdminChallengePolicyAuditItem,
    AdminChallengePolicyAuditListResponse,
    AdminChallengePolicyResponse,
    AdminChallengePolicyUpdateRequest,
    AdminBoardRiskKeywordsResponse,
    AdminBoardRiskKeywordsUpdateRequest,
    AdminGrantHistoryItem,
    AdminGrantHistoryResponse,
    AdminHighRiskItem,
    AdminHighRiskListResponse,
    AdminNotificationItem,
    AdminNotificationListResponse,
    AdminSummaryResponse,
    AdminUserItem,
    AdminUserListResponse,
    PendingReplyPostItem,
    PendingReplyPostListResponse,
)
from app.services.challenge_recommend import ALL_TECHNIQUES, default_challenge_policy, normalize_challenge_policy
from app.services.user_dashboard import build_user_weekly_dashboard


HIGH_RISK_SEVERITIES = {"높은 수준", "다소 높은 수준", "severe", "moderately_severe"}
CHALLENGE_POLICY_CONFIG_KEY = "challenge_policy_v1"
ADMIN_EMAILS_CONFIG_KEY = "admin_emails_v1"
BLOCKED_EMAILS_CONFIG_KEY = "blocked_emails_v1"
BOARD_RISK_KEYWORDS_CONFIG_KEY = "board_risk_keywords_v1"
DEFAULT_BOARD_RISK_KEYWORDS = [
    "죽이고",
    "죽여",
    "해치",
    "협박",
    "폭행",
    "자해",
    "자살",
    "테러",
    "살해",
    "살인",
]


def _is_high_risk_expr():
    return or_(Assessment.total_score >= 15, Assessment.severity.in_(HIGH_RISK_SEVERITIES))


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(UTC).isoformat()


def _normalize_repeatable(items: list[str]) -> list[str]:
    out: list[str] = []
    for x in items:
        t = x.strip()
        if t and t in ALL_TECHNIQUES and t not in out:
            out.append(t)
    return out


def _normalize_board_risk_keywords(items: list[str] | None) -> list[str]:
    source = items if isinstance(items, list) else DEFAULT_BOARD_RISK_KEYWORDS
    out: list[str] = []
    for x in source:
        t = str(x).strip().lower()
        if t and t not in out:
            out.append(t)
    return out or list(DEFAULT_BOARD_RISK_KEYWORDS)


def _normalize_blocked_emails(items: list[dict] | None) -> list[dict]:
    source = items if isinstance(items, list) else []
    out: list[dict] = []
    seen: set[str] = set()
    for item in source:
        if not isinstance(item, dict):
            continue
        email = str(item.get("email", "")).strip().lower()
        if not email or email in seen:
            continue
        seen.add(email)
        reason_raw = item.get("reason")
        blocked_at_raw = item.get("blocked_at")
        out.append(
            {
                "email": email,
                "reason": str(reason_raw).strip() if reason_raw else None,
                "blocked_at": str(blocked_at_raw).strip() if blocked_at_raw else datetime.now(UTC).isoformat(),
            }
        )
    return out


def _policy_diff(before: dict, after: dict) -> dict:
    diff: dict[str, dict[str, object]] = {}
    keys = sorted(set(before.keys()) | set(after.keys()))
    for key in keys:
        b = before.get(key)
        a = after.get(key)
        if b != a:
            diff[key] = {"before": b, "after": a}
    return diff


def parse_admin_emails_from_env() -> set[str]:
    raw = os.getenv("ADMIN_EMAILS", "")
    return {x.strip().lower() for x in raw.split(",") if x.strip()}


def get_admin_owner_email() -> str | None:
    raw = os.getenv("ADMIN_OWNER_EMAIL", "").strip().lower()
    if raw:
        return raw
    env_set = parse_admin_emails_from_env()
    if not env_set:
        return None
    return sorted(env_set)[0]


async def get_admin_email_set(db: AsyncSession) -> set[str]:
    env_set = parse_admin_emails_from_env()
    cfg = await crud.get_app_config_json(db, ADMIN_EMAILS_CONFIG_KEY)
    db_set: set[str] = set()
    if isinstance(cfg, dict):
        emails = cfg.get("emails", [])
        if isinstance(emails, list):
            db_set = {str(x).strip().lower() for x in emails if str(x).strip()}
    return env_set | db_set


async def get_admin_summary(db: AsyncSession) -> AdminSummaryResponse:
    total_users = int((await db.execute(select(func.count()).select_from(User))).scalar_one())
    total_assessments = int((await db.execute(select(func.count()).select_from(Assessment))).scalar_one())
    high_risk_assessments = int((await db.execute(select(func.count()).select_from(Assessment).where(_is_high_risk_expr()))).scalar_one())

    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    assessments_today = int((await db.execute(select(func.count()).select_from(Assessment).where(Assessment.created_at >= start))).scalar_one())

    noti_count = await crud.count_unread_admin_notifications(db)
    today_visitors = await crud.count_distinct_login_users_today(db, start_dt=start)
    login_users_today = await crud.count_login_events_today(db, start_dt=start)

    return AdminSummaryResponse(
        total_users=total_users,
        total_assessments=total_assessments,
        high_risk_assessments=high_risk_assessments,
        assessments_today=assessments_today,
        board_question_feedback_alerts=noti_count,
        today_visitors=today_visitors,
        login_users_today=login_users_today,
    )


async def list_admin_users(
    db: AsyncSession,
    *,
    page: int,
    page_size: int,
    q: str | None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> AdminUserListResponse:
    assessment_count_sq = (
        select(func.count(Assessment.id))
        .where(Assessment.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    latest_assessment_at_sq = (
        select(func.max(Assessment.created_at))
        .where(Assessment.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    login_count_sq = (
        select(func.count(LoginEvent.id))
        .where(LoginEvent.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    login_days_sq = (
        select(func.count(func.distinct(func.date(LoginEvent.logged_in_at))))
        .where(LoginEvent.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    latest_login_ip_sq = (
        select(LoginEvent.login_ip)
        .where(LoginEvent.user_id == User.id, LoginEvent.login_ip.is_not(None))
        .order_by(LoginEvent.logged_in_at.desc())
        .limit(1)
        .correlate(User)
        .scalar_subquery()
    )
    board_post_count_sq = (
        select(func.count(BoardPost.id))
        .where(BoardPost.author_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )

    base = select(
        User.id,
        User.email,
        User.nickname,
        User.created_at,
        assessment_count_sq.label("assessment_count"),
        latest_assessment_at_sq.label("latest_assessment_at"),
        login_count_sq.label("login_count"),
        login_days_sq.label("login_days"),
        latest_login_ip_sq.label("latest_login_ip"),
        board_post_count_sq.label("board_post_count"),
    ).select_from(User)

    if q:
        pattern = f"%{q.strip()}%"
        base = base.where(
            or_(
                User.email.ilike(pattern),
                User.nickname.ilike(pattern),
                cast(latest_login_ip_sq, String).ilike(pattern),
            )
        )

    try:
        total = int((await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one())

        sort_map = {
            "email": User.email,
            "nickname": User.nickname,
            "created_at": User.created_at,
            "assessment_count": assessment_count_sq,
            "login_count": login_count_sq,
            "login_days": login_days_sq,
            "latest_login_ip": latest_login_ip_sq,
            "board_post_count": board_post_count_sq,
        }
        sort_expr = sort_map.get(sort_by, User.created_at)
        order_expr = asc(sort_expr) if sort_order == "asc" else desc(sort_expr)

        offset = (page - 1) * page_size
        rows = (await db.execute(base.order_by(order_expr, User.created_at.desc()).offset(offset).limit(page_size))).all()

        items = [
            AdminUserItem(
                id=str(r.id),
                email=r.email,
                nickname=r.nickname,
                created_at=_iso(r.created_at) or "",
                assessment_count=int(r.assessment_count or 0),
                login_count=int(r.login_count or 0),
                login_days=int(r.login_days or 0),
                latest_login_ip=(str(r.latest_login_ip).strip() if r.latest_login_ip else None),
                board_post_count=int(r.board_post_count or 0),
                latest_assessment_at=_iso(r.latest_assessment_at),
            )
            for r in rows
        ]

        return AdminUserListResponse(page=page, page_size=page_size, total=total, items=items)
    except Exception:
        # 운영 DB 스키마가 부분적으로 오래된 경우(login_event/login_ip 미반영)에도 사용자 목록은 조회 가능해야 함
        await db.rollback()

        fallback = select(
            User.id,
            User.email,
            User.nickname,
            User.created_at,
            assessment_count_sq.label("assessment_count"),
            latest_assessment_at_sq.label("latest_assessment_at"),
            board_post_count_sq.label("board_post_count"),
        ).select_from(User)

        if q:
            pattern = f"%{q.strip()}%"
            fallback = fallback.where(or_(User.email.ilike(pattern), User.nickname.ilike(pattern)))

        total = int((await db.execute(select(func.count()).select_from(fallback.subquery()))).scalar_one())
        fallback_sort_map = {
            "email": User.email,
            "nickname": User.nickname,
            "created_at": User.created_at,
            "assessment_count": assessment_count_sq,
            "board_post_count": board_post_count_sq,
        }
        sort_expr = fallback_sort_map.get(sort_by, User.created_at)
        order_expr = asc(sort_expr) if sort_order == "asc" else desc(sort_expr)

        offset = (page - 1) * page_size
        rows = (await db.execute(fallback.order_by(order_expr, User.created_at.desc()).offset(offset).limit(page_size))).all()

        items = [
            AdminUserItem(
                id=str(r.id),
                email=r.email,
                nickname=r.nickname,
                created_at=_iso(r.created_at) or "",
                assessment_count=int(r.assessment_count or 0),
                login_count=0,
                login_days=0,
                latest_login_ip=None,
                board_post_count=int(r.board_post_count or 0),
                latest_assessment_at=_iso(r.latest_assessment_at),
            )
            for r in rows
        ]

        return AdminUserListResponse(page=page, page_size=page_size, total=total, items=items)


async def search_registered_users_for_admin_add(db: AsyncSession, *, q: str, limit: int = 10) -> AdminAccountSearchUserListResponse:
    rows = await crud.search_users_by_email_or_nickname(db, q=q, limit=limit)
    items = [
        AdminAccountSearchUserItem(id=str(u.id), email=u.email, nickname=u.nickname)
        for u in rows
    ]
    return AdminAccountSearchUserListResponse(total=len(items), items=items)


async def list_admin_assessments(db: AsyncSession, *, page: int, page_size: int, q: str | None, high_risk_only: bool) -> AdminAssessmentListResponse:
    base = (
        select(
            Assessment.id,
            Assessment.user_id,
            User.email,
            User.nickname,
            Assessment.type,
            Assessment.total_score,
            Assessment.severity,
            Assessment.created_at,
        )
        .join(User, User.id == Assessment.user_id)
    )

    if q:
        pattern = f"%{q.strip()}%"
        base = base.where(or_(User.email.ilike(pattern), User.nickname.ilike(pattern), cast(Assessment.type, String).ilike(pattern)))

    if high_risk_only:
        base = base.where(_is_high_risk_expr())

    total = int((await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one())
    offset = (page - 1) * page_size
    rows = (await db.execute(base.order_by(Assessment.created_at.desc()).offset(offset).limit(page_size))).all()

    items = [
        AdminAssessmentItem(
            id=str(r.id),
            user_id=str(r.user_id),
            user_email=r.email,
            user_nickname=r.nickname,
            type=str(r.type),
            total_score=int(r.total_score),
            severity=r.severity,
            created_at=_iso(r.created_at) or "",
        )
        for r in rows
    ]

    return AdminAssessmentListResponse(page=page, page_size=page_size, total=total, items=items)


def _major_risk_factor_text(*, alert_reason_codes: str | None, total_score: int, severity: str) -> str:
    reasons: list[str] = []
    mapping = {
        "worsening_delta": "전주 대비 점수 상승",
        "severe_band": "중증 구간",
        "high_composite": "종합 점수 높음",
    }
    if alert_reason_codes:
        for code in str(alert_reason_codes).split("|"):
            c = code.strip()
            if not c:
                continue
            reasons.append(mapping.get(c, c))
    if total_score >= 15:
        reasons.append("검사 총점 15점 이상")
    if severity:
        reasons.append(f"심각도: {severity}")
    unique: list[str] = []
    for r in reasons:
        if r not in unique:
            unique.append(r)
    return ", ".join(unique) if unique else "고위험 규칙 조건 충족"


async def list_admin_high_risk(db: AsyncSession, *, limit: int = 100) -> AdminHighRiskListResponse:
    stmt = (
        select(
            Assessment.id,
            Assessment.user_id,
            User.email,
            User.nickname,
            Assessment.type,
            Assessment.total_score,
            Assessment.severity,
            Assessment.created_at,
        )
        .join(User, User.id == Assessment.user_id)
        .where(_is_high_risk_expr())
        .order_by(Assessment.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()

    items: list[AdminHighRiskItem] = []
    for r in rows:
        dashboard_rows = await build_user_weekly_dashboard(db, r.user_id)
        latest = dashboard_rows[-1] if dashboard_rows else None

        dep = float(latest["dep_week_pred_0_100"]) if latest else None
        anx = float(latest["anx_week_pred_0_100"]) if latest else None
        ins = float(latest["ins_week_pred_0_100"]) if latest else None
        comp = float(latest["symptom_composite_pred_0_100"]) if latest else None
        alert_codes = str(latest.get("alert_reason_codes") or "") if latest else ""

        items.append(
            AdminHighRiskItem(
                assessment_id=str(r.id),
                user_id=str(r.user_id),
                user_email=r.email,
                user_nickname=r.nickname,
                occurred_at=_iso(r.created_at) or "",
                dep_score=dep,
                anx_score=anx,
                ins_score=ins,
                composite_score=comp,
                major_risk_factors=_major_risk_factor_text(
                    alert_reason_codes=alert_codes,
                    total_score=int(r.total_score),
                    severity=r.severity,
                ),
                type=str(r.type),
                total_score=int(r.total_score),
                severity=r.severity,
            )
        )

    return AdminHighRiskListResponse(total=len(items), items=items)


async def list_admin_notifications(db: AsyncSession, *, limit: int = 50) -> AdminNotificationListResponse:
    rows = await crud.list_admin_notifications(db, limit=limit)
    items = [
        AdminNotificationItem(
            id=str(r.id),
            type=str(r.type),
            title=r.title,
            message=r.message,
            ref_post_id=str(r.ref_post_id) if r.ref_post_id else None,
            is_read=r.is_read,
            created_at=_iso(r.created_at) or "",
        )
        for r in rows
    ]
    return AdminNotificationListResponse(total=len(items), items=items)


async def get_admin_challenge_policy(db: AsyncSession) -> AdminChallengePolicyResponse:
    raw = await crud.get_app_config_json(db, CHALLENGE_POLICY_CONFIG_KEY)
    policy = normalize_challenge_policy(raw or default_challenge_policy())
    return AdminChallengePolicyResponse(
        window_days=int(policy["window_days"]),
        similarity_threshold=float(policy["similarity_threshold"]),
        repeatable_techniques=list(policy["repeatable_techniques"]),
    )


async def update_admin_challenge_policy(
    db: AsyncSession,
    payload: AdminChallengePolicyUpdateRequest,
    *,
    actor_user_id: UUID,
    actor_email: str,
    actor_nickname: str | None,
) -> AdminChallengePolicyResponse:
    before_raw = await crud.get_app_config_json(db, CHALLENGE_POLICY_CONFIG_KEY)
    before = normalize_challenge_policy(before_raw or default_challenge_policy())

    cleaned = {
        "window_days": payload.window_days,
        "similarity_threshold": payload.similarity_threshold,
        "repeatable_techniques": _normalize_repeatable(list(payload.repeatable_techniques)),
    }
    policy = normalize_challenge_policy(cleaned)
    saved = await crud.upsert_app_config_json(db, CHALLENGE_POLICY_CONFIG_KEY, policy)
    after = normalize_challenge_policy(saved)

    diff = _policy_diff(before, after)
    if diff:
        await crud.create_app_config_audit(
            db=db,
            config_key=CHALLENGE_POLICY_CONFIG_KEY,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            actor_nickname=actor_nickname,
            before_json=before,
            after_json=after,
            diff_json=diff,
        )

    return AdminChallengePolicyResponse(
        window_days=int(after["window_days"]),
        similarity_threshold=float(after["similarity_threshold"]),
        repeatable_techniques=list(after["repeatable_techniques"]),
    )


async def list_admin_challenge_policy_audit(db: AsyncSession, *, limit: int = 50) -> AdminChallengePolicyAuditListResponse:
    rows = await crud.list_app_config_audit(db, config_key=CHALLENGE_POLICY_CONFIG_KEY, limit=limit)
    items = [
        AdminChallengePolicyAuditItem(
            id=str(r.id),
            actor_email=r.actor_email,
            actor_nickname=r.actor_nickname,
            created_at=_iso(r.created_at) or "",
            before_json=dict(r.before_json or {}),
            after_json=dict(r.after_json or {}),
            diff_json=dict(r.diff_json or {}),
        )
        for r in rows
    ]
    return AdminChallengePolicyAuditListResponse(total=len(items), items=items)


async def list_admin_accounts(db: AsyncSession, *, current_user_email: str | None = None) -> AdminAccountListResponse:
    env_set = parse_admin_emails_from_env()
    cfg = await crud.get_app_config_json(db, ADMIN_EMAILS_CONFIG_KEY)
    db_set: set[str] = set()
    if isinstance(cfg, dict) and isinstance(cfg.get("emails"), list):
        db_set = {str(x).strip().lower() for x in cfg.get("emails", []) if str(x).strip()}

    owner_email = get_admin_owner_email()

    items: list[AdminAccountItem] = []
    for email in sorted(env_set):
        items.append(AdminAccountItem(email=email, source="env", is_owner=(email == owner_email)))
    for email in sorted(db_set):
        items.append(AdminAccountItem(email=email, source="db" if email not in env_set else "env+db", is_owner=(email == owner_email)))

    dedup: dict[str, AdminAccountItem] = {}
    for item in items:
        dedup[item.email] = item
    out = list(dedup.values())
    out.sort(key=lambda x: x.email)

    current_is_owner = bool(current_user_email and owner_email and current_user_email.lower() == owner_email)
    return AdminAccountListResponse(total=len(out), owner_email=owner_email, current_user_is_owner=current_is_owner, items=out)


async def add_admin_account_email(db: AsyncSession, *, email: str, actor_user_id: UUID, actor_email: str, actor_nickname: str | None) -> AdminAccountListResponse:
    target = email.strip().lower()
    user = await crud.get_user_by_email(db, target)
    if user is None:
        raise ValueError("회원가입된 계정만 관리자 권한을 부여할 수 있습니다.")
    cfg = await crud.get_app_config_json(db, ADMIN_EMAILS_CONFIG_KEY) or {"emails": []}
    emails = cfg.get("emails", []) if isinstance(cfg, dict) else []
    cleaned = sorted({str(x).strip().lower() for x in emails if str(x).strip()} | {target})
    before = {"emails": sorted({str(x).strip().lower() for x in emails if str(x).strip()})}
    after = {"emails": cleaned}

    await crud.upsert_app_config_json(db, ADMIN_EMAILS_CONFIG_KEY, after)
    diff = _policy_diff(before, after)
    if diff:
        await crud.create_app_config_audit(
            db=db,
            config_key=ADMIN_EMAILS_CONFIG_KEY,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            actor_nickname=actor_nickname,
            before_json=before,
            after_json=after,
            diff_json=diff,
        )

    return await list_admin_accounts(db, current_user_email=actor_email)


async def remove_admin_account_email(
    db: AsyncSession,
    *,
    email: str,
    actor_user_id: UUID,
    actor_email: str,
    actor_nickname: str | None,
) -> AdminAccountListResponse:
    owner_email = get_admin_owner_email()
    if not owner_email or actor_email.lower() != owner_email:
        raise ValueError("관리자 권한 회수는 오너 관리자만 가능합니다.")

    target = email.strip().lower()
    if target == owner_email:
        raise ValueError("오너 관리자 계정은 회수할 수 없습니다.")

    env_set = parse_admin_emails_from_env()
    if target in env_set:
        raise ValueError("ENV에 등록된 관리자 계정은 회수할 수 없습니다.")

    cfg = await crud.get_app_config_json(db, ADMIN_EMAILS_CONFIG_KEY) or {"emails": []}
    emails = cfg.get("emails", []) if isinstance(cfg, dict) else []
    before_set = {str(x).strip().lower() for x in emails if str(x).strip()}
    if target not in before_set:
        return await list_admin_accounts(db, current_user_email=actor_email)

    after_set = set(before_set)
    after_set.discard(target)

    total_admins_after = len(env_set | after_set)
    if total_admins_after < 1:
        raise ValueError("최소 1명의 관리자 계정은 유지되어야 합니다.")

    before = {"emails": sorted(before_set)}
    after = {"emails": sorted(after_set)}

    await crud.upsert_app_config_json(db, ADMIN_EMAILS_CONFIG_KEY, after)
    diff = _policy_diff(before, after)
    if diff:
        await crud.create_app_config_audit(
            db=db,
            config_key=ADMIN_EMAILS_CONFIG_KEY,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            actor_nickname=actor_nickname,
            before_json=before,
            after_json=after,
            diff_json=diff,
        )

    return await list_admin_accounts(db, current_user_email=actor_email)


async def list_pending_reply_posts(db: AsyncSession, *, admin_emails: set[str], limit: int = 100) -> PendingReplyPostListResponse:
    admin_users = await crud.list_users_by_emails(db, sorted(admin_emails))
    admin_ids = {u.id for u in admin_users}

    stmt = (
        select(BoardPost.id, BoardPost.category, BoardPost.title, BoardPost.created_at, User.nickname)
        .join(User, User.id == BoardPost.author_id)
        # 구/신 enum 혼용("질문"/"문의") 환경 모두 지원
        .where(
            cast(BoardPost.category, String).in_(
                [
                    BoardCategory.INQUIRY.name,
                    BoardCategory.LEGACY_INQUIRY.name,
                    BoardCategory.FEEDBACK.name,
                    BoardCategory.INQUIRY.value,
                    BoardCategory.LEGACY_INQUIRY.value,
                    BoardCategory.FEEDBACK.value,
                ]
            )
        )
        .order_by(BoardPost.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()

    items: list[PendingReplyPostItem] = []
    for r in rows:
        comments = await crud.list_board_comments(db, r.id)
        answered = any(c.author_id in admin_ids for c in comments)
        if answered:
            continue

        raw_category = str(r.category.value if hasattr(r.category, "value") else r.category)
        if raw_category == BoardCategory.LEGACY_INQUIRY.value:
            raw_category = BoardCategory.INQUIRY.value

        items.append(
            PendingReplyPostItem(
                post_id=str(r.id),
                category=raw_category,
                title=r.title,
                author_nickname=r.nickname,
                created_at=_iso(r.created_at) or "",
            )
        )

    return PendingReplyPostListResponse(total=len(items), items=items)



async def list_admin_grant_history(db: AsyncSession, *, limit: int = 100) -> AdminGrantHistoryResponse:
    rows = await crud.list_app_config_audit(db, config_key=ADMIN_EMAILS_CONFIG_KEY, limit=limit)
    items: list[AdminGrantHistoryItem] = []
    for r in rows:
        diff = dict(r.diff_json or {})
        emails_diff = diff.get("emails")
        if not isinstance(emails_diff, dict):
            continue
        before = emails_diff.get("before", [])
        after = emails_diff.get("after", [])
        before_set = {str(x).strip().lower() for x in before if str(x).strip()} if isinstance(before, list) else set()
        after_set = {str(x).strip().lower() for x in after if str(x).strip()} if isinstance(after, list) else set()
        added = sorted(after_set - before_set)
        for email in added:
            items.append(
                AdminGrantHistoryItem(
                    granted_at=_iso(r.created_at) or "",
                    granted_by_email=r.actor_email,
                    granted_by_nickname=r.actor_nickname,
                    granted_to_email=email,
                )
            )
    return AdminGrantHistoryResponse(total=len(items), items=items[:limit])


async def get_admin_board_risk_keywords(db: AsyncSession) -> AdminBoardRiskKeywordsResponse:
    raw = await crud.get_app_config_json(db, BOARD_RISK_KEYWORDS_CONFIG_KEY)
    keywords = _normalize_board_risk_keywords(raw.get("keywords") if isinstance(raw, dict) else None)
    return AdminBoardRiskKeywordsResponse(keywords=keywords)


async def update_admin_board_risk_keywords(
    db: AsyncSession,
    payload: AdminBoardRiskKeywordsUpdateRequest,
    *,
    actor_user_id: UUID,
    actor_email: str,
    actor_nickname: str | None,
) -> AdminBoardRiskKeywordsResponse:
    before_raw = await crud.get_app_config_json(db, BOARD_RISK_KEYWORDS_CONFIG_KEY)
    before = {
        "keywords": _normalize_board_risk_keywords(before_raw.get("keywords") if isinstance(before_raw, dict) else None),
    }

    after = {"keywords": _normalize_board_risk_keywords(list(payload.keywords))}
    await crud.upsert_app_config_json(db, BOARD_RISK_KEYWORDS_CONFIG_KEY, after)

    diff = _policy_diff(before, after)
    if diff:
        await crud.create_app_config_audit(
            db=db,
            config_key=BOARD_RISK_KEYWORDS_CONFIG_KEY,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            actor_nickname=actor_nickname,
            before_json=before,
            after_json=after,
            diff_json=diff,
        )

    return AdminBoardRiskKeywordsResponse(keywords=after["keywords"])


async def list_admin_blocked_ips(db: AsyncSession, *, active_only: bool = False, limit: int = 200) -> AdminBlockedIPListResponse:
    rows = await crud.list_blocked_ips(db, active_only=active_only, limit=limit)
    items = [
        AdminBlockedIPItem(
            id=str(r.id),
            ip_address=r.ip_address,
            reason=r.reason,
            is_active=bool(r.is_active),
            created_at=_iso(r.created_at) or "",
        )
        for r in rows
    ]
    return AdminBlockedIPListResponse(total=len(items), items=items)


async def add_admin_blocked_ip(
    db: AsyncSession,
    payload: AdminBlockedIPCreateRequest,
    *,
    actor_user_id: UUID,
) -> AdminBlockedIPListResponse:
    await crud.upsert_blocked_ip(
        db,
        ip_address=payload.ip_address,
        reason=payload.reason,
        created_by_user_id=actor_user_id,
        is_active=True,
    )
    return await list_admin_blocked_ips(db, active_only=False, limit=200)


async def remove_admin_blocked_ip(db: AsyncSession, *, ip_address: str) -> AdminBlockedIPListResponse:
    await crud.deactivate_blocked_ip(db, ip_address)
    return await list_admin_blocked_ips(db, active_only=False, limit=200)


def _blocked_email_set_from_items(items: list[dict]) -> set[str]:
    return {str(x.get("email", "")).strip().lower() for x in items if isinstance(x, dict) and str(x.get("email", "")).strip()}


async def is_email_blocked(db: AsyncSession, email: str) -> bool:
    target = email.strip().lower()
    if not target:
        return False
    raw = await crud.get_app_config_json(db, BLOCKED_EMAILS_CONFIG_KEY)
    items = _normalize_blocked_emails(raw.get("items") if isinstance(raw, dict) else None)
    return target in _blocked_email_set_from_items(items)


async def list_admin_blocked_emails(db: AsyncSession) -> AdminBlockedEmailListResponse:
    raw = await crud.get_app_config_json(db, BLOCKED_EMAILS_CONFIG_KEY)
    items = _normalize_blocked_emails(raw.get("items") if isinstance(raw, dict) else None)
    out = [
        AdminBlockedEmailItem(
            email=i["email"],
            reason=i.get("reason"),
            blocked_at=str(i.get("blocked_at") or datetime.now(UTC).isoformat()),
        )
        for i in items
    ]
    return AdminBlockedEmailListResponse(total=len(out), items=out)


async def add_admin_blocked_email(db: AsyncSession, payload: AdminBlockedEmailCreateRequest) -> AdminBlockedEmailListResponse:
    current = await crud.get_app_config_json(db, BLOCKED_EMAILS_CONFIG_KEY)
    items = _normalize_blocked_emails(current.get("items") if isinstance(current, dict) else None)

    target = payload.email.strip().lower()
    existing = _blocked_email_set_from_items(items)
    if target not in existing:
        items.append(
            {
                "email": target,
                "reason": payload.reason.strip() if isinstance(payload.reason, str) and payload.reason.strip() else None,
                "blocked_at": datetime.now(UTC).isoformat(),
            }
        )

    items = _normalize_blocked_emails(items)
    await crud.upsert_app_config_json(db, BLOCKED_EMAILS_CONFIG_KEY, {"items": items})
    return await list_admin_blocked_emails(db)


async def remove_admin_blocked_email(db: AsyncSession, *, email: str) -> AdminBlockedEmailListResponse:
    current = await crud.get_app_config_json(db, BLOCKED_EMAILS_CONFIG_KEY)
    items = _normalize_blocked_emails(current.get("items") if isinstance(current, dict) else None)
    target = email.strip().lower()
    next_items = [i for i in items if i.get("email") != target]
    await crud.upsert_app_config_json(db, BLOCKED_EMAILS_CONFIG_KEY, {"items": next_items})
    return await list_admin_blocked_emails(db)
