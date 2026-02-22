import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class AssessmentType(str, enum.Enum):
    PHQ9 = "PHQ9"
    GAD7 = "GAD7"
    ISI = "ISI"


class User(Base):
    __tablename__ = "user"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    nickname: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    assessments: Mapped[list["Assessment"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    checkins: Mapped[list["CheckIn"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Assessment(Base):
    __tablename__ = "assessment"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("user.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    type: Mapped[AssessmentType] = mapped_column(SQLEnum(AssessmentType, name="assessment_type"), nullable=False)
    answers: Mapped[dict[str, int]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=False)
    total_score: Mapped[int] = mapped_column(Integer, nullable=False)
    severity: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="assessments")


class CheckIn(Base):
    __tablename__ = "checkin"
    __table_args__ = (CheckConstraint("mood_score >= 1 AND mood_score <= 10", name="ck_checkin_mood_score_1_10"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
    )
    mood_score: Mapped[int] = mapped_column(Integer, nullable=False)
    sleep_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    exercised: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="checkins")
