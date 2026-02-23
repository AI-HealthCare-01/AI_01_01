import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CHECK_MODEL_PATH = PROJECT_ROOT / "AI" / "models" / "baseline_check_overall_level.joblib"
DEFAULT_MONITOR_MODEL_PATH = PROJECT_ROOT / "AI" / "models" / "baseline_monitor_trend_label.joblib"


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
    check_model_path: str = os.getenv("CHECK_MODEL_PATH", str(DEFAULT_CHECK_MODEL_PATH))
    monitor_model_path: str = os.getenv("MONITOR_MODEL_PATH", str(DEFAULT_MONITOR_MODEL_PATH))


settings = Settings()
