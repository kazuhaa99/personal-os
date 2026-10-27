"""Bearer tokens for the native shells (Capacitor on iOS, Tauri on macOS).

Their WebViews run on capacitor://localhost / tauri://localhost, where the web's
SameSite=Strict cookie never reaches the API. They sign in for a pair of opaque
random tokens instead:

- access token  (posat_<secret>): sent as "Authorization: Bearer", short-lived;
- refresh token (posrt_<family>.<secret>): exchanged for a new pair, which rotates both.

Only SHA-256 hashes are stored (the secrets are 256-bit random values, so a plain
hash is enough). `family` is the session's own random id: a refresh token of a
known family whose secret is no longer current has leaked, however many rotations
ago, so the whole session is revoked. The one exception is a retry of the token
rotated a moment ago (REFRESH_RETRY_GRACE), so a refresh whose response was lost
on a flaky mobile network does not sign the app out.

Sessions also end after native_session_max_days however often they refresh, and
signing in clears expired sessions and keeps at most MAX_SESSIONS_PER_USER.
The web keeps using the cookie (services/auth.py).
"""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import NativeSession, User
from app.services.auth import Unauthorized, needs_verification, user_out

ACCESS_PREFIX = "posat_"
REFRESH_PREFIX = "posrt_"
DEVICE_NAME_MAX = 64
REFRESH_RETRY_GRACE = timedelta(seconds=30)
MAX_SESSIONS_PER_USER = 20


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _rotate(session: NativeSession) -> dict:
    """Give the session a fresh token pair and return it in the API's response shape."""
    s, now = get_settings(), _now()
    access = ACCESS_PREFIX + secrets.token_urlsafe(32)
    refresh_token = f"{REFRESH_PREFIX}{session.family}.{secrets.token_urlsafe(32)}"
    session.access_hash, session.refresh_hash = _hash(access), _hash(refresh_token)
    session.access_expires_at = now + timedelta(minutes=s.native_access_minutes)
    session.refresh_expires_at = min(now + timedelta(days=s.native_refresh_days),
                                     session.created_at + timedelta(days=s.native_session_max_days))
    session.rotated_at = session.last_used_at = now
    return {"token_type": "Bearer", "access_token": access, "refresh_token": refresh_token,
            "expires_in": s.native_access_minutes * 60,
            "refresh_expires_in": int((session.refresh_expires_at - now).total_seconds())}


def _prune(db: Session, user_id: int) -> None:
    """Drop expired sessions (anyone's) and this user's oldest beyond the cap, making room for one more."""
    db.execute(delete(NativeSession).where(NativeSession.refresh_expires_at <= _now()))
    surplus = db.scalars(select(NativeSession.id).where(NativeSession.user_id == user_id)
                         .order_by(NativeSession.id.desc()).offset(MAX_SESSIONS_PER_USER - 1)).all()
    if surplus:
        db.execute(delete(NativeSession).where(NativeSession.id.in_(surplus)))


def issue(db: Session, user: User, device_name: str = "") -> dict:
    _prune(db, user.id)
    session = NativeSession(user_id=user.id, family=secrets.token_hex(16), created_at=_now(),
                            device_name=device_name.strip()[:DEVICE_NAME_MAX])
    tokens = _rotate(session)
    db.add(session)
    db.commit()
    return {**tokens, "user": user_out(user)}


def session_for_access(db: Session, token: str) -> NativeSession | None:
    """The live session behind an access token, or None (unknown, expired, user unusable)."""
    if not token.startswith(ACCESS_PREFIX):
        return None
    session = db.scalar(select(NativeSession).where(NativeSession.access_hash == _hash(token)))
    if session is None or session.access_expires_at <= _now():
        return None
    user = db.get(User, session.user_id)
    if user is None or needs_verification(user):
        return None
    return session


def _revoke_and_refuse(db: Session, session: NativeSession) -> None:
    db.delete(session)
    db.commit()
    raise Unauthorized("Sign in required")


def refresh(db: Session, token: str) -> dict:
    """Swap a refresh token for a new pair; a stale token of the session revokes it."""
    family, _, secret = token.removeprefix(REFRESH_PREFIX).partition(".")
    if not token.startswith(REFRESH_PREFIX) or not family or not secret:
        raise Unauthorized("Sign in required")
    # Row lock: two refreshes with the same token are serialised, so the second sees the rotation.
    session = db.scalar(select(NativeSession).where(NativeSession.family == family).with_for_update())
    if session is None:
        raise Unauthorized("Sign in required")
    digest, now = _hash(token), _now()
    current = hmac.compare_digest(digest, session.refresh_hash)
    retry = (not current and session.prev_refresh_hash is not None
             and hmac.compare_digest(digest, session.prev_refresh_hash)
             and session.rotated_at is not None and now - session.rotated_at <= REFRESH_RETRY_GRACE)
    if not (current or retry):
        _revoke_and_refuse(db, session)
    user = db.get(User, session.user_id)
    if session.refresh_expires_at <= now or user is None or needs_verification(user):
        _revoke_and_refuse(db, session)
    if current:
        session.prev_refresh_hash = session.refresh_hash
    tokens = _rotate(session)
    db.commit()
    return {**tokens, "user": user_out(user)}


def revoke(db: Session, session_id: int) -> None:
    session = db.get(NativeSession, session_id)
    if session is not None:
        db.delete(session)
        db.commit()
