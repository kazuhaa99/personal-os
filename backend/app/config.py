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
    # Default timezone used until the owner changes it in Settings.
    default_timezone: str = "Asia/Almaty"
    log_level: str = "INFO"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip() and o.strip() != "*"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
