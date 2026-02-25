import uuid
from datetime import datetime, timezone

from sqlalchemy import Select, and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.db.models import (
    AppConfig,
    AppConfigAudit,
    AdminNotification,
    AdminNotificationType,
    Assessment,
    AssessmentType,
    BoardCategory,
    BoardComment,
    BoardPost,
    BoardPostBookmark,
    BoardPostLike,
    ChatEvent,
    ChallengeHistory,
    CheckIn,
    EmailVerification,
    LoginEvent,
    User,
    UserProfile,
    UserSecurityQA,
)


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    stmt: Select[tuple[User]] = select(User).where(User.email == email)
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    stmt: Select[tuple[User]] = select(User).where(User.id == user_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    email: str,
    password: str,
    nickname: str,
    security_question: str | None = None,
    security_answer: str | None = None,
) -> User:
    user = User(email=email, password_hash=hash_password(password), nickname=nickname)
    db.add(user)
    await db.flush()

    if security_question and security_answer:
        db.add(UserSecurityQA(user_id=user.id, question=security_question, answer_hash=hash_password(security_answer)))

    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    user = await get_user_by_email(db, email)
    if not user or not verify_password(password, user.password_hash):
        return None
    return user


async def get_user_security_qa(db: AsyncSession, user_id: uuid.UUID) -> UserSecurityQA | None:
    stmt: Select[tuple[UserSecurityQA]] = select(UserSecurityQA).where(UserSecurityQA.user_id == user_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def verify_security_answer(db: AsyncSession, email: str, answer: str) -> bool:
    user = await get_user_by_email(db, email)
    if not user:
        return False
    qa = await get_user_security_qa(db, user.id)
    return bool(qa and verify_password(answer, qa.answer_hash))


async def reset_password_by_security_answer(db: AsyncSession, email: str, answer: str, new_password: str) -> bool:
    user = await get_user_by_email(db, email)
    if not user:
        return False
    qa = await get_user_security_qa(db, user.id)
    if not qa or not verify_password(answer, qa.answer_hash):
        return False

    user.password_hash = hash_password(new_password)
    await db.commit()
    return True


async def create_email_verification(db: AsyncSession, email: str, code: str, expires_at: datetime) -> EmailVerification:
    stmt: Select[tuple[EmailVerification]] = select(EmailVerification).where(
        EmailVerification.email == email,
        EmailVerification.used.is_(False),
    )
    for row in (await db.execute(stmt)).scalars().all():
        row.used = True

    ev = EmailVerification(email=email, code=code, expires_at=expires_at, used=False)
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    return ev


async def consume_email_verification_code(db: AsyncSession, email: str, code: str) -> bool:
    now = datetime.now(timezone.utc)
    stmt: Select[tuple[EmailVerification]] = (
        select(EmailVerification)
        .where(EmailVerification.email == email, EmailVerification.code == code, EmailVerification.used.is_(False))
        .order_by(desc(EmailVerification.created_at))
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        return False
    expires_at = row.expires_at.replace(tzinfo=timezone.utc) if row.expires_at.tzinfo is None else row.expires_at.astimezone(timezone.utc)
    if expires_at < now:
        return False

    row.used = True
    await db.commit()
    return True


async def get_or_create_user_profile(db: AsyncSession, user_id: uuid.UUID) -> UserProfile:
    stmt: Select[tuple[UserProfile]] = select(UserProfile).where(UserProfile.user_id == user_id)
    profile = (await db.execute(stmt)).scalar_one_or_none()
    if profile:
        return profile

    profile = UserProfile(user_id=user_id)
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


async def update_user_profile(db: AsyncSession, user_id: uuid.UUID, *, nickname: str | None = None, new_password: str | None = None) -> User:
    user = await get_user_by_id(db, user_id)
    if not user:
        raise ValueError("사용자를 찾을 수 없습니다.")

    if nickname is not None:
        user.nickname = nickname
    if new_password is not None:
        user.password_hash = hash_password(new_password)

    await db.commit()
    await db.refresh(user)
    return user


async def create_phq9_assessment(db: AsyncSession, user_id: uuid.UUID, answers: dict[str, int], total_score: int, severity: str) -> Assessment:
    row = Assessment(user_id=user_id, type=AssessmentType.PHQ9, answers=answers, total_score=total_score, severity=severity)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def list_phq9_assessments_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Assessment]:
    stmt: Select[tuple[Assessment]] = (
        select(Assessment)
        .where(Assessment.user_id == user_id, Assessment.type == AssessmentType.PHQ9)
        .order_by(desc(Assessment.created_at))
    )
    return list((await db.execute(stmt)).scalars().all())


async def get_phq9_assessment_by_id(db: AsyncSession, user_id: uuid.UUID, assessment_id: uuid.UUID) -> Assessment | None:
    stmt: Select[tuple[Assessment]] = select(Assessment).where(
        Assessment.id == assessment_id,
        Assessment.user_id == user_id,
        Assessment.type == AssessmentType.PHQ9,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def create_chat_event(
    db: AsyncSession,
    user_id: uuid.UUID,
    user_message: str,
    assistant_reply: str,
    extracted: dict,
    suggested_challenges: list[str],
) -> ChatEvent:
    row = ChatEvent(
        user_id=user_id,
        user_message=user_message,
        assistant_reply=assistant_reply,
        extracted=extracted,
        suggested_challenges=suggested_challenges,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def create_checkin(db: AsyncSession, user_id: uuid.UUID, mood_score: int, sleep_hours: float | None, exercised: bool, note: str | None) -> CheckIn:
    row = CheckIn(user_id=user_id, mood_score=mood_score, sleep_hours=sleep_hours, exercised=exercised, note=note)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_latest_checkin(db: AsyncSession, user_id: uuid.UUID) -> CheckIn | None:
    stmt: Select[tuple[CheckIn]] = select(CheckIn).where(CheckIn.user_id == user_id).order_by(desc(CheckIn.created_at)).limit(1)
    return (await db.execute(stmt)).scalar_one_or_none()


async def create_admin_notification(
    db: AsyncSession,
    *,
    ntype: AdminNotificationType,
    title: str,
    message: str,
    ref_post_id: uuid.UUID | None,
) -> AdminNotification:
    row = AdminNotification(type=ntype, title=title, message=message, ref_post_id=ref_post_id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def list_admin_notifications(db: AsyncSession, limit: int = 50) -> list[AdminNotification]:
    stmt: Select[tuple[AdminNotification]] = select(AdminNotification).order_by(desc(AdminNotification.created_at)).limit(limit)
    return list((await db.execute(stmt)).scalars().all())


async def count_unread_admin_notifications(db: AsyncSession) -> int:
    stmt = select(func.count(AdminNotification.id)).where(AdminNotification.is_read.is_(False))
    return int((await db.execute(stmt)).scalar_one())


async def create_board_post(
    db: AsyncSession,
    *,
    author_id: uuid.UUID,
    category: BoardCategory,
    title: str,
    content: str,
    is_notice: bool,
    is_private: bool,
) -> BoardPost:
    row = BoardPost(
        author_id=author_id,
        category=category,
        title=title,
        content=content,
        is_notice=is_notice,
        is_private=is_private,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_board_post_by_id(db: AsyncSession, post_id: uuid.UUID) -> BoardPost | None:
    stmt: Select[tuple[BoardPost]] = select(BoardPost).where(BoardPost.id == post_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_board_posts(
    db: AsyncSession,
    *,
    q: str | None = None,
    category: BoardCategory | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[BoardPost], int]:
    stmt = select(BoardPost)
    count_stmt = select(func.count(BoardPost.id))

    if category is not None:
        stmt = stmt.where(BoardPost.category == category)
        count_stmt = count_stmt.where(BoardPost.category == category)

    if q:
        keyword = f"%{q}%"
        cond = or_(BoardPost.title.ilike(keyword), BoardPost.content.ilike(keyword))
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    stmt = stmt.order_by(desc(BoardPost.is_notice), desc(BoardPost.created_at)).offset((page - 1) * page_size).limit(page_size)
    rows = list((await db.execute(stmt)).scalars().all())
    total = int((await db.execute(count_stmt)).scalar_one())
    return rows, total


async def update_board_post(
    db: AsyncSession,
    row: BoardPost,
    *,
    title: str | None = None,
    content: str | None = None,
    category: BoardCategory | None = None,
    is_notice: bool | None = None,
    is_private: bool | None = None,
) -> BoardPost:
    if title is not None:
        row.title = title
    if content is not None:
        row.content = content
    if category is not None:
        row.category = category
    if is_notice is not None:
        row.is_notice = is_notice
    if is_private is not None:
        row.is_private = is_private
    await db.commit()
    await db.refresh(row)
    return row


async def delete_board_post(db: AsyncSession, row: BoardPost) -> None:
    await db.delete(row)
    await db.commit()


async def create_board_comment(db: AsyncSession, *, post_id: uuid.UUID, author_id: uuid.UUID, content: str) -> BoardComment:
    row = BoardComment(post_id=post_id, author_id=author_id, content=content)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def list_board_comments(db: AsyncSession, post_id: uuid.UUID) -> list[BoardComment]:
    stmt: Select[tuple[BoardComment]] = select(BoardComment).where(BoardComment.post_id == post_id).order_by(BoardComment.created_at.asc())
    return list((await db.execute(stmt)).scalars().all())


async def count_board_comments(db: AsyncSession, post_id: uuid.UUID) -> int:
    stmt = select(func.count(BoardComment.id)).where(BoardComment.post_id == post_id)
    return int((await db.execute(stmt)).scalar_one())


async def count_board_likes(db: AsyncSession, post_id: uuid.UUID) -> int:
    stmt = select(func.count(BoardPostLike.id)).where(BoardPostLike.post_id == post_id)
    return int((await db.execute(stmt)).scalar_one())


async def count_board_bookmarks(db: AsyncSession, post_id: uuid.UUID) -> int:
    stmt = select(func.count(BoardPostBookmark.id)).where(BoardPostBookmark.post_id == post_id)
    return int((await db.execute(stmt)).scalar_one())


async def has_liked_post(db: AsyncSession, post_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    stmt: Select[tuple[BoardPostLike]] = select(BoardPostLike).where(and_(BoardPostLike.post_id == post_id, BoardPostLike.user_id == user_id))
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def has_bookmarked_post(db: AsyncSession, post_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    stmt: Select[tuple[BoardPostBookmark]] = select(BoardPostBookmark).where(and_(BoardPostBookmark.post_id == post_id, BoardPostBookmark.user_id == user_id))
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def toggle_post_like(db: AsyncSession, post_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    stmt: Select[tuple[BoardPostLike]] = select(BoardPostLike).where(and_(BoardPostLike.post_id == post_id, BoardPostLike.user_id == user_id))
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()
        return False

    db.add(BoardPostLike(post_id=post_id, user_id=user_id))
    await db.commit()
    return True


async def toggle_post_bookmark(db: AsyncSession, post_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    stmt: Select[tuple[BoardPostBookmark]] = select(BoardPostBookmark).where(and_(BoardPostBookmark.post_id == post_id, BoardPostBookmark.user_id == user_id))
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()
        return False

    db.add(BoardPostBookmark(post_id=post_id, user_id=user_id))
    await db.commit()
    return True


async def create_challenge_history(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    challenge_name: str,
    challenge_key: str,
    technique: str,
    source: str = "llm",
    completed: bool = True,
    effect_score: int | None = None,
) -> ChallengeHistory:
    row = ChallengeHistory(
        user_id=user_id,
        challenge_name=challenge_name,
        challenge_key=challenge_key,
        technique=technique,
        source=source,
        completed=completed,
        effect_score=effect_score,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def list_recent_challenge_histories(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    days: int = 14,
    limit: int = 200,
) -> list[ChallengeHistory]:
    cutoff = datetime.now(timezone.utc).timestamp() - (days * 24 * 60 * 60)
    cutoff_dt = datetime.fromtimestamp(cutoff, tz=timezone.utc)
    stmt: Select[tuple[ChallengeHistory]] = (
        select(ChallengeHistory)
        .where(
            ChallengeHistory.user_id == user_id,
            ChallengeHistory.completed.is_(True),
            ChallengeHistory.created_at >= cutoff_dt,
        )
        .order_by(desc(ChallengeHistory.created_at))
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())



async def get_app_config_json(db: AsyncSession, key: str) -> dict | None:
    stmt: Select[tuple[AppConfig]] = select(AppConfig).where(AppConfig.key == key)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        return None
    return dict(row.value_json or {})


async def upsert_app_config_json(db: AsyncSession, key: str, value: dict) -> dict:
    stmt: Select[tuple[AppConfig]] = select(AppConfig).where(AppConfig.key == key)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        row = AppConfig(key=key, value_json=value)
        db.add(row)
    else:
        row.value_json = value
    await db.commit()
    await db.refresh(row)
    return dict(row.value_json or {})



async def create_app_config_audit(
    db: AsyncSession,
    *,
    config_key: str,
    actor_user_id: uuid.UUID | None,
    actor_email: str,
    actor_nickname: str | None,
    before_json: dict,
    after_json: dict,
    diff_json: dict,
) -> AppConfigAudit:
    row = AppConfigAudit(
        config_key=config_key,
        actor_user_id=actor_user_id,
        actor_email=actor_email,
        actor_nickname=actor_nickname,
        before_json=before_json,
        after_json=after_json,
        diff_json=diff_json,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def list_app_config_audit(db: AsyncSession, *, config_key: str, limit: int = 50) -> list[AppConfigAudit]:
    stmt: Select[tuple[AppConfigAudit]] = (
        select(AppConfigAudit)
        .where(AppConfigAudit.config_key == config_key)
        .order_by(desc(AppConfigAudit.created_at))
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())



async def create_login_event(db: AsyncSession, user_id: uuid.UUID) -> LoginEvent:
    row = LoginEvent(user_id=user_id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def list_users_by_emails(db: AsyncSession, emails: list[str]) -> list[User]:
    if not emails:
        return []
    lower_emails = [e.lower() for e in emails]
    stmt: Select[tuple[User]] = select(User).where(func.lower(User.email).in_(lower_emails))
    return list((await db.execute(stmt)).scalars().all())


async def count_login_events_today(db: AsyncSession, *, start_dt: datetime) -> int:
    stmt = select(func.count(LoginEvent.id)).where(LoginEvent.logged_in_at >= start_dt)
    return int((await db.execute(stmt)).scalar_one())


async def count_distinct_login_users_today(db: AsyncSession, *, start_dt: datetime) -> int:
    stmt = select(func.count(func.distinct(LoginEvent.user_id))).where(LoginEvent.logged_in_at >= start_dt)
    return int((await db.execute(stmt)).scalar_one())
