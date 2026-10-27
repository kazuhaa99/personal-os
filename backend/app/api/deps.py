import secrets

from fastapi import Cookie, Header, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.services import native_tokens
from app.services.auth import SESSION_COOKIE, first_user_id, session_user_id
from app.tenancy import set_current_user


def bearer_user(db: Session, request: Request, authorization: str | None) -> int | None:
    """The user behind "Authorization: Bearer …", or None.

    A native app's access token (posat_…) is that app's own user; it also marks the
    request with the native session, so account endpoints know which device is calling.
    Otherwise the token may be the shared POS_API_TOKEN, which acts as the first account.
    """
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    if token.startswith(native_tokens.ACCESS_PREFIX):
        session = native_tokens.session_for_access(db, token)
        if session is None:
            return None
        request.state.native_session_id = session.id
        return session.user_id
    expected = get_settings().api_token
    if expected and secrets.compare_digest(token.encode(), expected.encode()):
        return first_user_id(db)
    return None


def _resolve_user(request: Request, authorization: str | None, session: str | None) -> int | None:
    """The database lookups behind require_user; blocking, so they run in the threadpool."""
    settings = get_settings()
    with SessionLocal() as db:
        uid = bearer_user(db, request, authorization)
        if uid is None and not settings.auth_enabled and not settings.api_token:
            uid = first_user_id(db)
        elif uid is None and session:
            uid = session_user_id(db, session)
    return uid


async def require_user(
    request: Request,
    authorization: str | None = Header(default=None),
    session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> int:
    """Resolve the signed-in user and scope all data access to them.

    Async on purpose: the user id is stored in a context variable, and only
    values set in the request's own task are visible to the (threadpool)
    endpoint that runs afterwards. The lookups themselves run in the threadpool.

    Accepted credentials: the login session cookie (web UI); a native app's
    access token as "Authorization: Bearer posat_…" (iOS / macOS shells); or —
    when POS_API_TOKEN is configured — "Authorization: Bearer <token>", which
    acts as the first account (for scripts). With POS_AUTH_ENABLED=false every
    request acts as the first account (localhost-only setups).
    """
    uid = await run_in_threadpool(_resolve_user, request, authorization, session)
    if uid is None:
        set_current_user(None)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Sign in required", headers={"WWW-Authenticate": "Bearer"})
    set_current_user(uid)
    return uid


# Kept for the router wiring in main.py.
require_token = require_user
