import os
from dataclasses import dataclass


@dataclass(slots=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "Mental Health Check API")
    api_v1_prefix: str = os.getenv("API_V1_PREFIX", "")
    secret_key: str = os.getenv("SECRET_KEY", "dev-only-change-me")
    algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/mental_health",
    )


settings = Settings()
