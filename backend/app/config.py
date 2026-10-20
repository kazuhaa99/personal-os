from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables (or backend/.env)."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="POS_", extra="ignore")

    database_url: str = "postgresql+psycopg://personal_os:personal_os_dev@localhost:5432/personal_os"
    # Comma-separated list of allowed browser origins. Never "*".
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # Optional shared secret. When set, every /api request must send
    # "Authorization: Bearer <token>". Strongly recommended if the API is reachable
    # from anything other than localhost.
    api_token: str | None = Field(default=None)
    # The first account, created on first start when no users exist yet.
    # Change the password (POS_AUTH_PASSWORD, or in the app) before exposing the app.
    auth_enabled: bool = True
    # Anyone who can reach the app may create an account (each sees only their own data).
    allow_registration: bool = True
    auth_username: str = "admin"
    auth_password: str = "adminuser123"
    # Signs session cookies. If unset, a random key is generated and kept in
    # backend/.secret_key so sessions survive restarts.
    secret_key: str | None = Field(default=None)
    session_days: int = 30
    # Set to true when served over HTTPS so the session cookie is never sent in clear.
    cookie_secure: bool = False
    # Outgoing mail (email confirmation codes). For Gmail use smtp.gmail.com:587 and an
    # App Password (Google Account → Security → 2-Step Verification → App passwords).
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = "spokeesofficial@gmail.com"
    smtp_password: str | None = Field(default=None)
    mail_from: str = "Personal OS <spokeesofficial@gmail.com>"
    # Local development without SMTP: print confirmation codes to the server log instead.
    mail_dev_log: bool = False
    # Default timezone used until the owner changes it in Settings.
    default_timezone: str = "Asia/Almaty"
    log_level: str = "INFO"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip() and o.strip() != "*"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
