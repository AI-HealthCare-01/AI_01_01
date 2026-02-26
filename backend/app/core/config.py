import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CHECK_MODEL_PATH = PROJECT_ROOT / "model" / "models" / "dep_nowcast_rf.joblib"
DEFAULT_MONITOR_MODEL_PATH = PROJECT_ROOT / "model" / "models" / "anx_nowcast_rf.joblib"
DEFAULT_NOWCAST_MODEL_DIR = PROJECT_ROOT / "model" / "models"
DEFAULT_NOWCAST_DATA_PATH = PROJECT_ROOT / "model" / "data" / "derived" / "train_user_day_nowcast.csv"
DEFAULT_NOWCAST_CBT_RAW_PATH = PROJECT_ROOT / "model" / "data" / "raw" / "cbt_session.csv"
DEFAULT_NOWCAST_WEEKLY_OUTPUT_PATH = PROJECT_ROOT / "model" / "outputs" / "nowcast_user_week_dashboard.csv"


def _to_bool(value: str, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _resolve_path(value: str, default_path: Path) -> str:
    raw = (value or "").strip()
    if not raw:
        return str(default_path)

    p = Path(raw)
    if p.exists():
        return str(p)

    if p.is_absolute():
        mapped = PROJECT_ROOT / raw.lstrip("/")
        if mapped.exists():
            return str(mapped)

    rel = PROJECT_ROOT / raw
    if rel.exists():
        return str(rel)

    return raw


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

    check_model_path: str = _resolve_path(
        os.getenv("CHECK_MODEL_PATH", ""),
        DEFAULT_CHECK_MODEL_PATH,
    )
    monitor_model_path: str = _resolve_path(
        os.getenv("MONITOR_MODEL_PATH", ""),
        DEFAULT_MONITOR_MODEL_PATH,
    )
    nowcast_model_dir: str = _resolve_path(
        os.getenv("NOWCAST_MODEL_DIR", ""),
        DEFAULT_NOWCAST_MODEL_DIR,
    )
    nowcast_data_path: str = _resolve_path(
        os.getenv("NOWCAST_DATA_PATH", ""),
        DEFAULT_NOWCAST_DATA_PATH,
    )
    nowcast_cbt_raw_path: str = _resolve_path(
        os.getenv("NOWCAST_CBT_RAW_PATH", ""),
        DEFAULT_NOWCAST_CBT_RAW_PATH,
    )
    nowcast_weekly_output_path: str = _resolve_path(
        os.getenv("NOWCAST_WEEKLY_OUTPUT_PATH", ""),
        DEFAULT_NOWCAST_WEEKLY_OUTPUT_PATH,
    )

    smtp_host: str = os.getenv("SMTP_HOST", "")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_username: str = os.getenv("SMTP_USERNAME", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    smtp_from_email: str = os.getenv("SMTP_FROM_EMAIL", "")
    smtp_use_tls: bool = _to_bool(os.getenv("SMTP_USE_TLS", "1"), True)
    smtp_use_ssl: bool = _to_bool(os.getenv("SMTP_USE_SSL", "0"), False)
    # Keep disabled by default so verification always follows real email delivery.
    email_verification_dev_code_exposed: bool = _to_bool(
        os.getenv("EMAIL_VERIFICATION_DEV_CODE_EXPOSED", "0"),
        True,
    )


settings = Settings()
