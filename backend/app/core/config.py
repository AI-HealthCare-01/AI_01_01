import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CHECK_MODEL_PATH = PROJECT_ROOT / "AI" / "models" / "baseline_check_overall_level.joblib"
DEFAULT_MONITOR_MODEL_PATH = PROJECT_ROOT / "AI" / "models" / "baseline_monitor_trend_label.joblib"
DEFAULT_NOWCAST_MODEL_DIR = PROJECT_ROOT / "model" / "models"
DEFAULT_NOWCAST_DATA_PATH = PROJECT_ROOT / "model" / "data" / "derived" / "train_user_day_nowcast.csv"
DEFAULT_NOWCAST_CBT_RAW_PATH = PROJECT_ROOT / "model" / "data" / "raw" / "cbt_session.csv"
DEFAULT_NOWCAST_WEEKLY_OUTPUT_PATH = PROJECT_ROOT / "model" / "outputs" / "nowcast_user_week_dashboard.csv"


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
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    check_model_path: str = os.getenv("CHECK_MODEL_PATH", str(DEFAULT_CHECK_MODEL_PATH))
    monitor_model_path: str = os.getenv("MONITOR_MODEL_PATH", str(DEFAULT_MONITOR_MODEL_PATH))
    nowcast_model_dir: str = os.getenv("NOWCAST_MODEL_DIR", str(DEFAULT_NOWCAST_MODEL_DIR))
    nowcast_data_path: str = os.getenv("NOWCAST_DATA_PATH", str(DEFAULT_NOWCAST_DATA_PATH))
    nowcast_cbt_raw_path: str = os.getenv("NOWCAST_CBT_RAW_PATH", str(DEFAULT_NOWCAST_CBT_RAW_PATH))
    nowcast_weekly_output_path: str = os.getenv(
        "NOWCAST_WEEKLY_OUTPUT_PATH",
        str(DEFAULT_NOWCAST_WEEKLY_OUTPUT_PATH),
    )


settings = Settings()
