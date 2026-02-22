import uuid

from sqlalchemy import Select, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.db.models import Assessment, AssessmentType, User


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
