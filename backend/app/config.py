from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables (or backend/.env)."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="POS_", extra="ignore")

    # Fields marked repr=False hold secrets: they never appear in repr()/str(), so a traceback or
    # debug log that prints the settings can't leak them.
    database_url: str = Field(default="postgresql+psycopg://personal_os:personal_os_dev@localhost:5432/personal_os", repr=False)
    # Migrations run as the table owner; the app itself should use a non-superuser role so
    # Postgres row-level security applies (see app/rls.py). Unset = use database_url.
    migration_database_url: str | None = Field(default=None, repr=False)
    # The non-superuser role the app connects as; migrations grant it data access.
    app_db_role: str = "personal_os_app"
    # Comma-separated list of allowed browser origins. Never "*".
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # Origins of the native shells' WebViews (Capacitor on iOS, Tauri on macOS); they sign in
    # with bearer tokens, never the cookie. Also comma-separated, also never "*".
    native_origins: str = "capacitor://localhost,tauri://localhost"
    # Native sign-in: a short-lived access token plus a rotating refresh token.
    native_access_minutes: int = 15
    native_refresh_days: int = 60
    # Hard cap on a native session's age, however often it refreshes: then sign in again.
    native_session_max_days: int = 180
    # Optional shared secret. When set, every /api request must send
    # "Authorization: Bearer <token>". Strongly recommended if the API is reachable
    # from anything other than localhost.
    api_token: str | None = Field(default=None, repr=False)
    # The first account, created on first start when no users exist yet.
    # Change the password (POS_AUTH_PASSWORD, or in the app) before exposing the app.
    auth_enabled: bool = True
    # Anyone who can reach the app may create an account (each sees only their own data).
    allow_registration: bool = True
    auth_username: str = "admin"
    auth_password: str = Field(default="adminuser123", repr=False)
    # Signs session cookies. If unset, a random key is generated and kept in
    # backend/.secret_key so sessions survive restarts.
    secret_key: str | None = Field(default=None, repr=False)
    session_days: int = 30
    # Set to true when served over HTTPS so the session cookie is never sent in clear.
    cookie_secure: bool = False
    # Path of the session cookie. Under a prefix on a shared domain (e.g. "/personalos/") the
    # cookie then stays with this app instead of being sent to the whole site.
    cookie_path: str = "/"
    # Outgoing mail (email confirmation codes). For Gmail use smtp.gmail.com:587 and an
    # App Password (Google Account → Security → 2-Step Verification → App passwords).
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = "spokeesofficial@gmail.com"
    smtp_password: str | None = Field(default=None, repr=False)
    mail_from: str = "Personal OS <spokeesofficial@gmail.com>"
    # Local development without SMTP: print confirmation codes to the server log instead.
    mail_dev_log: bool = False
    # Default timezone used until the owner changes it in Settings.
    default_timezone: str = "Asia/Almaty"
    log_level: str = "INFO"

    @property
    def cors_origin_list(self) -> list[str]:
        origins = f"{self.cors_origins},{self.native_origins}".split(",")
        return list(dict.fromkeys(o.strip() for o in origins if o.strip() and o.strip() != "*"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
