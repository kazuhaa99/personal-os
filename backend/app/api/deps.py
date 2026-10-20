import secrets

from fastapi import Cookie, Header, HTTPException, status

from app.config import get_settings
from app.db import SessionLocal
from app.services.auth import SESSION_COOKIE, first_user_id, session_user_id
from app.tenancy import set_current_user


async def require_user(
    authorization: str | None = Header(default=None),
    session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> int:
    """Resolve the signed-in user and scope all data access to them.

    Async on purpose: the user id is stored in a context variable, and only
    values set in the request's own task are visible to the (threadpool)
    endpoint that runs afterwards.

    Accepted credentials: the login session cookie (web UI), or — when
    POS_API_TOKEN is configured — "Authorization: Bearer <token>", which acts
    as the first account (for scripts). With POS_AUTH_ENABLED=false every
    request acts as the first account (localhost-only setups).
    """
    settings = get_settings()
    uid: int | None = None
    with SessionLocal() as db:
        expected = settings.api_token
        scheme, _, token = (authorization or "").partition(" ")
        if expected and scheme.lower() == "bearer" and secrets.compare_digest(token.encode(), expected.encode()):
            uid = first_user_id(db)
        elif not settings.auth_enabled and not expected:
            uid = first_user_id(db)
        elif session:
            uid = session_user_id(db, session)
    if uid is None:
        set_current_user(None)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Sign in required", headers={"WWW-Authenticate": "Bearer"})
    set_current_user(uid)
    return uid


# Kept for the router wiring in main.py.
require_token = require_user
