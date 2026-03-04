from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, echo=False, future=True)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    # Import models before create_all so metadata is fully registered.
    from app.db import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        dialect = conn.dialect.name
        if dialect.startswith("postgres"):
            # Existing DB may have chat_event without session_id; add non-destructively.
            await conn.execute(text("ALTER TABLE chat_event ADD COLUMN IF NOT EXISTS session_id VARCHAR(36)"))
        elif dialect.startswith("sqlite"):
            rows = (await conn.execute(text("PRAGMA table_info(chat_event)"))).all()
            columns = {str(r[1]) for r in rows if len(r) > 1}
            if "session_id" not in columns:
                await conn.execute(text("ALTER TABLE chat_event ADD COLUMN session_id VARCHAR(36)"))
