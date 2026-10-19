import secrets

from fastapi import Cookie, Header, HTTPException, status

from app.config import get_settings
from app.services.auth import SESSION_COOKIE, verify_session


def require_token(
    authorization: str | None = Header(default=None),
    session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> None:
    """Gate for every /api route.

    Accepts either a valid login session cookie (web UI) or, when POS_API_TOKEN
    is configured, "Authorization: Bearer <token>" (scripts). This is a
    single-owner login, not a multi-user account system.
    """
    settings = get_settings()
    expected = settings.api_token
    if expected:
        scheme, _, token = (authorization or "").partition(" ")
        if scheme.lower() == "bearer" and secrets.compare_digest(token.encode(), expected.encode()):
            return
    if settings.auth_enabled:
        if session and verify_session(session):
            return
    elif not expected:
        return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sign in required",
        headers={"WWW-Authenticate": "Bearer"},
    )
