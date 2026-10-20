"""Secrets in Settings must never show up in its repr/str: an AttributeError, a traceback or a
debug log that prints the settings object would otherwise leak them (it happened once)."""

from app.config import Settings

SECRETS = {
    "database_url": "postgresql+psycopg://u:db-secret-1@h/d",
    "migration_database_url": "postgresql+psycopg://o:db-secret-2@h/d",
    "api_token": "token-secret-3",
    "auth_password": "admin-secret-4",
    "secret_key": "key-secret-5",
    "smtp_password": "smtp-secret-6",
}


def test_secrets_are_not_in_repr():
    s = Settings(**SECRETS)
    text = repr(s) + str(s)
    for name, value in SECRETS.items():
        assert value not in text, name
        assert getattr(s, name) == value  # still usable as plain strings


def test_non_secrets_stay_visible():
    assert "smtp.gmail.com" in repr(Settings())
