"""Accounts, passwords, sessions and one-time email codes."""

import hashlib
import hmac
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import DomainError, ValidationFailed
from app.models import User
from app.services import mail
from app.services.i18n import current
from app.tenancy import acting_as

SESSION_COOKIE = "pos_session"
USERNAME_RE = re.compile(r"^[a-z0-9_.]{3,32}$")
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")
CODE_TTL = timedelta(minutes=15)
CODE_RESEND_AFTER = timedelta(seconds=60)
CODE_MAX_ATTEMPTS = 5

_KEY_FILE = Path(__file__).resolve().parents[2] / ".secret_key"
_key_cache: bytes | None = None


class TooManyRequests(DomainError):
    status_code = 429
    code = "rate_limited"


class Unauthorized(DomainError):
    status_code = 401
    code = "unauthorized"


class EmailUnverified(DomainError):
    status_code = 403
    code = "email_unverified"


def _key() -> bytes:
    global _key_cache
    configured = get_settings().secret_key
    if configured:
        return configured.encode()
    if _key_cache is None:
        try:
            _key_cache = _KEY_FILE.read_bytes().strip()
        except FileNotFoundError:
            _key_cache = secrets.token_hex(32).encode()
            try:
                _KEY_FILE.write_bytes(_key_cache)
                _KEY_FILE.chmod(0o600)
            except OSError:
                pass  # read-only filesystem: sessions last until restart; set POS_SECRET_KEY to persist
    return _key_cache


def _sign(payload: str) -> str:
    return hmac.new(_key(), payload.encode(), hashlib.sha256).hexdigest()


# ------------------------------------------------------------------ passwords

_SCRYPT = {"n": 2**14, "r": 8, "p": 1}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, dklen=32, **_SCRYPT)
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, digest = stored.split("$")
        got = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=32)
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(got.hex(), digest)


# A real-looking hash so "unknown user" costs the same time as "wrong password".
_DUMMY_HASH = hash_password(secrets.token_hex(8))


def validate_password(password: str) -> None:
    if len(password) < 8:
        raise ValidationFailed("Password must be at least 8 characters", code="password_short")
    if len(password) > 200:
        raise ValidationFailed("Password is too long")


def normalize_username(username: str) -> str:
    u = username.strip().lower()
    if not USERNAME_RE.match(u):
        raise ValidationFailed("Username: 3–32 characters, latin letters, digits, “_” or “.”", code="username_format")
    return u


def normalize_email(email: str) -> str:
    e = email.strip().lower()
    if not EMAIL_RE.match(e) or len(e) > 254:
        raise ValidationFailed("Enter a valid email address", code="email_format")
    return e


# ------------------------------------------------------------------ users

def find_user(db: Session, identifier: str) -> User | None:
    """By username or email (case-insensitive)."""
    ident = identifier.strip().lower()
    if not ident:
        return None
    col = User.email if "@" in ident else User.username
    return db.scalars(select(User).where(func.lower(col) == ident)).first()


def first_user_id(db: Session) -> int | None:
    return db.scalar(select(func.min(User.id)))


def provision(db: Session, user: User) -> None:
    """Default rows every account starts with."""
    from app.services.categories import ensure_default_categories
    from app.services.profile import ensure_profile
    from app.services.settings import ensure_app_settings

    with acting_as(user.id):
        ensure_app_settings(db)
        ensure_default_categories(db)
        ensure_profile(db)


def ensure_admin(db: Session) -> None:
    """On first start create the initial account from POS_AUTH_USERNAME / POS_AUTH_PASSWORD."""
    if first_user_id(db) is not None:
        return
    s = get_settings()
    user = User(username=normalize_username(s.auth_username), email="", password_hash=hash_password(s.auth_password))
    db.add(user)
    db.commit()
    provision(db, user)


def create_user(db: Session, username: str, email: str, password: str) -> User:
    username, email = normalize_username(username), normalize_email(email)
    validate_password(password)
    if find_user(db, username):
        raise ValidationFailed("This username is taken", code="username_taken")
    if find_user(db, email):
        raise ValidationFailed("An account with this email already exists", code="email_taken")
    if not mail.is_configured():
        raise mail.MailUnavailable("Email sending is not configured on the server, so new accounts can't be confirmed")
    user = User(username=username, email=email, password_hash=hash_password(password))
    db.add(user)
    db.commit()
    provision(db, user)
    return user


def authenticate(db: Session, identifier: str, password: str) -> User:
    user = find_user(db, identifier)
    ok = verify_password(password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok:
        raise Unauthorized("Wrong username or password")
    return user


def needs_verification(user: User) -> bool:
    return bool(user.email) and user.email_verified_at is None


def set_password(db: Session, user: User, password: str) -> None:
    validate_password(password)
    user.password_hash = hash_password(password)
    user.session_epoch += 1  # signs out every other device
    db.commit()


# ------------------------------------------------------------------ sessions

def create_session(user: User) -> str:
    expires = int(time.time()) + get_settings().session_days * 86400
    payload = f"{user.id}|{user.session_epoch}|{expires}|{secrets.token_hex(8)}"
    return f"{payload}|{_sign(payload)}"


def session_user_id(db: Session, token: str) -> int | None:
    payload, _, sig = token.rpartition("|")
    if not payload or not hmac.compare_digest(sig, _sign(payload)):
        return None
    parts = payload.split("|")
    if len(parts) != 4 or not all(p.isdigit() for p in parts[:3]):
        return None
    uid, epoch, expires = int(parts[0]), int(parts[1]), int(parts[2])
    if expires < time.time():
        return None
    user = db.get(User, uid)
    if user is None or user.session_epoch != epoch or needs_verification(user):
        return None
    return uid


# ------------------------------------------------------------------ one-time codes

def _code_hash(user: User, purpose: str, target: str, code: str) -> str:
    return hmac.new(_key(), f"{user.id}|{purpose}|{target}|{code}".encode(), hashlib.sha256).hexdigest()


MAILS = {
    "verify": {
        "en": ("Confirm your email · Personal OS", "Your code to confirm {email} in Personal OS:\n\n    {code}\n\nIt expires in 15 minutes. If you didn't sign up, ignore this email."),
        "ru": ("Подтверждение почты · Personal OS", "Ваш код для подтверждения {email} в Personal OS:\n\n    {code}\n\nКод действует 15 минут. Если вы не регистрировались, просто проигнорируйте письмо."),
        "ko": ("이메일 인증 · Personal OS", "Personal OS에서 {email} 주소를 인증하는 코드입니다:\n\n    {code}\n\n15분 동안 유효해요. 가입하지 않았다면 이 메일을 무시하세요."),
    },
    "change_email": {
        "en": ("Confirm your new email · Personal OS", "Your code to switch your Personal OS login email to {email}:\n\n    {code}\n\nIt expires in 15 minutes."),
        "ru": ("Подтверждение новой почты · Personal OS", "Ваш код, чтобы сменить почту для входа в Personal OS на {email}:\n\n    {code}\n\nКод действует 15 минут."),
        "ko": ("새 이메일 인증 · Personal OS", "Personal OS 로그인 이메일을 {email}(으)로 바꾸는 코드입니다:\n\n    {code}\n\n15분 동안 유효해요."),
    },
    "reset": {
        "en": ("Reset your password · Personal OS", "Your code to reset the Personal OS password for {username}:\n\n    {code}\n\nIt expires in 15 minutes. If you didn't ask for this, ignore this email — your password stays the same."),
        "ru": ("Сброс пароля · Personal OS", "Ваш код для сброса пароля Personal OS (аккаунт {username}):\n\n    {code}\n\nКод действует 15 минут. Если вы этого не запрашивали, проигнорируйте письмо — пароль не изменится."),
        "ko": ("비밀번호 재설정 · Personal OS", "Personal OS 계정 {username}의 비밀번호 재설정 코드입니다:\n\n    {code}\n\n15분 동안 유효해요. 요청하지 않았다면 이 메일을 무시하세요. 비밀번호는 바뀌지 않아요."),
    },
}


def send_code(db: Session, user: User, purpose: str) -> None:
    target = user.pending_email if purpose == "change_email" else user.email
    if not target:
        raise ValidationFailed("Add an email address first")
    now = datetime.now(timezone.utc)
    if user.code_purpose == purpose and user.code_sent_at and now - user.code_sent_at < CODE_RESEND_AFTER:
        raise TooManyRequests("Please wait a minute before requesting another code")
    code = f"{secrets.randbelow(1_000_000):06d}"
    subject, body = MAILS[purpose].get(current(), MAILS[purpose]["en"])
    mail.send(target, subject, body.format(email=target, username=user.username, code=code))
    user.code_purpose, user.code_hash = purpose, _code_hash(user, purpose, target, code)
    user.code_expires_at, user.code_sent_at, user.code_attempts = now + CODE_TTL, now, 0
    db.commit()


def check_code(db: Session, user: User, purpose: str, code: str) -> None:
    target = user.pending_email if purpose == "change_email" else user.email
    now = datetime.now(timezone.utc)
    if user.code_purpose != purpose or not user.code_hash or not user.code_expires_at or user.code_expires_at < now:
        raise ValidationFailed("The code has expired. Request a new one.", code="code_expired")
    if user.code_attempts >= CODE_MAX_ATTEMPTS:
        raise TooManyRequests("Too many wrong codes. Request a new one.")
    if not re.fullmatch(r"\d{6}", code or "") or not hmac.compare_digest(user.code_hash, _code_hash(user, purpose, target or "", code)):
        user.code_attempts += 1
        db.commit()
        raise ValidationFailed("Wrong code", code="code_wrong")
    user.code_purpose = user.code_hash = user.code_expires_at = None
    user.code_attempts = 0


def code_pending(user: User, purpose: str) -> bool:
    return bool(user.code_purpose == purpose and user.code_expires_at and user.code_expires_at > datetime.now(timezone.utc))


def user_out(user: User) -> dict:
    return {"id": user.id, "username": user.username, "email": user.email, "email_verified": bool(user.email and user.email_verified_at),
            "pending_email": user.pending_email, "change_email_pending": code_pending(user, "change_email")}
