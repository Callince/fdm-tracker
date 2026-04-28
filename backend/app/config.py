"""Runtime settings loaded from environment."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env absolutely so the app loads the right file regardless of the
# process cwd (e.g., when launched from the repo root via preview_start).
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = "development"
    app_name: str = "fdm-tracker"
    log_level: str = "INFO"

    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_ttl_min: int = 720
    refresh_token_ttl_min: int = 20160
    bcrypt_rounds: int = 12

    hmac_clock_skew_sec: int = 300
    max_keystrokes_per_min: int = 1200
    max_mouse_events_per_min: int = 6000

    cors_origins: str = ""

    # Comma-separated domains allowed to self-register via /auth/signup.
    # Compared case-insensitively against the part after the "@".
    allowed_signup_domains: str = "fourdm.com,fourdm.digital"

    # --- Email verification -------------------------------------------------
    # backend: "console" (dev), "gmail" (OAuth via Gmail API), or "smtp".
    email_backend: str = "console"
    email_from: str = "FDM Tracker <no-reply@fourdm.com>"

    # SMTP (only read when email_backend=smtp)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True

    # Gmail API (only read when email_backend=gmail)
    # mode: "oauth" (refresh-token flow) or "service_account" (DWD on Workspace)
    gmail_mode: str = "oauth"
    gmail_sender: str = ""                       # From header, e.g. no-reply@fourdm.com

    # oauth mode
    gmail_client_id: str = ""
    gmail_client_secret: str = ""
    gmail_refresh_token: str = ""

    # service_account mode
    gmail_service_account_file: str = ""
    gmail_impersonate: str = ""                  # the Workspace mailbox to send as

    verification_code_ttl_min: int = 15
    verification_max_attempts: int = 5
    verification_resend_cooldown_sec: int = 60

    default_idle_threshold_min: int = 5
    default_workday_start_hour: int = 4
    default_timezone: str = "Asia/Kolkata"

    @field_validator("jwt_secret")
    @classmethod
    def _jwt_secret_not_default(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("JWT_SECRET must be at least 32 chars")
        return v

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_signup_domains_set(self) -> set[str]:
        return {d.strip().lower().lstrip("@") for d in self.allowed_signup_domains.split(",") if d.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
