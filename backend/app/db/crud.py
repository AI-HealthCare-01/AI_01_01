import uuid
from datetime import datetime, timezone

from sqlalchemy import Select, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.db.models import Assessment, AssessmentType, ChatEvent, CheckIn, EmailVerification, User, UserProfile


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    stmt: Select[tuple[User]] = select(User).where(User.email == email)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    stmt: Select[tuple[User]] = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, email: str, password: str, nickname: str) -> User:
    user = User(email=email, password_hash=hash_password(password), nickname=nickname)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    user = await get_user_by_email(db, email)
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


async def create_email_verification(
    db: AsyncSession,
    email: str,
    code: str,
    expires_at: datetime,
) -> EmailVerification:
    # invalidate old active codes for the same email
    stmt: Select[tuple[EmailVerification]] = select(EmailVerification).where(
        EmailVerification.email == email,
        EmailVerification.used.is_(False),
    )
    old_rows = (await db.execute(stmt)).scalars().all()
    for row in old_rows:
        row.used = True

    ev = EmailVerification(email=email, code=code, expires_at=expires_at, used=False)
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    return ev


async def consume_email_verification_code(
    db: AsyncSession,
    email: str,
    code: str,
) -> bool:
    now = datetime.now(timezone.utc)
    stmt: Select[tuple[EmailVerification]] = (
        select(EmailVerification)
        .where(
            EmailVerification.email == email,
            EmailVerification.code == code,
            EmailVerification.used.is_(False),
        )
        .order_by(desc(EmailVerification.created_at))
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        return False
    if row.expires_at.tzinfo is None:
        expires_at = row.expires_at.replace(tzinfo=timezone.utc)
    else:
        expires_at = row.expires_at.astimezone(timezone.utc)
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


async def update_user_profile(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    nickname: str | None = None,
    new_password: str | None = None,
) -> User:
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


async def create_phq9_assessment(
    db: AsyncSession,
    user_id: uuid.UUID,
    answers: dict[str, int],
    total_score: int,
    severity: str,
) -> Assessment:
    assessment = Assessment(
        user_id=user_id,
        type=AssessmentType.PHQ9,
        answers=answers,
        total_score=total_score,
        severity=severity,
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    return assessment


async def list_phq9_assessments_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Assessment]:
    stmt: Select[tuple[Assessment]] = (
        select(Assessment)
        .where(Assessment.user_id == user_id, Assessment.type == AssessmentType.PHQ9)
        .order_by(desc(Assessment.created_at))
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_phq9_assessment_by_id(
    db: AsyncSession,
    user_id: uuid.UUID,
    assessment_id: uuid.UUID,
) -> Assessment | None:
    stmt: Select[tuple[Assessment]] = select(Assessment).where(
        Assessment.id == assessment_id,
        Assessment.user_id == user_id,
        Assessment.type == AssessmentType.PHQ9,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_chat_event(
    db: AsyncSession,
    user_id: uuid.UUID,
    user_message: str,
    assistant_reply: str,
    extracted: dict,
    suggested_challenges: list[str],
) -> ChatEvent:
    event = ChatEvent(
        user_id=user_id,
        user_message=user_message,
        assistant_reply=assistant_reply,
        extracted=extracted,
        suggested_challenges=suggested_challenges,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


async def create_checkin(
    db: AsyncSession,
    user_id: uuid.UUID,
    mood_score: int,
    sleep_hours: float | None,
    exercised: bool,
    note: str | None,
) -> CheckIn:
    row = CheckIn(
        user_id=user_id,
        mood_score=mood_score,
        sleep_hours=sleep_hours,
        exercised=exercised,
        note=note,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_latest_checkin(db: AsyncSession, user_id: uuid.UUID) -> CheckIn | None:
    stmt: Select[tuple[CheckIn]] = (
        select(CheckIn)
        .where(CheckIn.user_id == user_id)
        .order_by(desc(CheckIn.created_at))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()
