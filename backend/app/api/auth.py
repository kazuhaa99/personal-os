import time
from collections import deque

from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services.auth import SESSION_COOKIE, check_credentials, create_session, verify_session

router = APIRouter(prefix="/auth", tags=["auth"])

# Crude brute-force brake: at most 10 failed attempts per client per 5 minutes.
_failures: dict[str, deque[float]] = {}
_WINDOW, _MAX_FAILS = 300, 10


class LoginIn(BaseModel):
    username: str = Field(max_length=200)
    password: str = Field(max_length=200)


def _recent_failures(client: str) -> deque[float]:
    q = _failures.setdefault(client, deque())
    while q and q[0] < time.time() - _WINDOW:
        q.popleft()
    return q


@router.get("/me")
def me(session: str | None = Cookie(default=None, alias=SESSION_COOKIE)):
    s = get_settings()
    if not s.auth_enabled:
        return {"authenticated": True, "username": None, "auth_enabled": False}
    user = verify_session(session) if session else None
    return {"authenticated": bool(user), "username": user, "auth_enabled": True}


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response):
    client = request.client.host if request.client else "?"
    fails = _recent_failures(client)
    if len(fails) >= _MAX_FAILS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Try again in a few minutes.")
    if not check_credentials(body.username, body.password):
        fails.append(time.time())
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong username or password")
    fails.clear()
    s = get_settings()
    response.set_cookie(
        SESSION_COOKIE, create_session(body.username), max_age=s.session_days * 86400,
        httponly=True, samesite="strict", secure=s.cookie_secure, path="/",
    )
    return {"authenticated": True, "username": body.username}


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
