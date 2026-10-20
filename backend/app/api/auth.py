import time
from collections import deque
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import require_user
from app.config import get_settings
from app.db import get_db
from app.models import User
from app.services import auth as svc
from app.services import mail
from app.services.i18n import use_language
from app.tenancy import current_user_id

router = APIRouter(prefix="/auth", tags=["auth"], dependencies=[Depends(use_language)])

# Crude brute-force brake per client and action: at most 10 attempts per 5 minutes.
_hits: dict[tuple[str, str], deque[float]] = {}
_WINDOW, _MAX = 300, 10


def _throttle(request: Request, action: str, count: bool = True) -> None:
    client = request.client.host if request.client else "?"
    q = _hits.setdefault((client, action), deque())
    while q and q[0] < time.time() - _WINDOW:
        q.popleft()
    if len(q) >= _MAX:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Try again in a few minutes.")
    if count:
        q.append(time.time())


def _clear(request: Request, action: str) -> None:
    _hits.pop((request.client.host if request.client else "?", action), None)


def _sign_in(response: Response, db: Session, user: User) -> dict:
    s = get_settings()
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    response.set_cookie(svc.SESSION_COOKIE, svc.create_session(user), max_age=s.session_days * 86400,
                        httponly=True, samesite="strict", secure=s.cookie_secure, path="/")
    return {"authenticated": True, "user": svc.user_out(user)}


class LoginIn(BaseModel):
    identifier: str = Field(max_length=254)  # username or email
    password: str = Field(max_length=200)


class RegisterIn(BaseModel):
    username: str = Field(max_length=64)
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)


class CodeIn(BaseModel):
    identifier: str = Field(max_length=254)
    code: str = Field(max_length=12)


class IdentifierIn(BaseModel):
    identifier: str = Field(max_length=254)


class ResetIn(CodeIn):
    password: str = Field(max_length=200)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(max_length=200)


class ChangeEmailIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)


class ConfirmIn(BaseModel):
    code: str = Field(max_length=12)


class DeleteAccountIn(BaseModel):
    password: str = Field(max_length=200)


@router.get("/me")
def me(session: str | None = Cookie(default=None, alias=svc.SESSION_COOKIE), db: Session = Depends(get_db)):
    s = get_settings()
    info = {"registration_open": s.allow_registration and mail.is_configured(), "auth_enabled": s.auth_enabled}
    uid = svc.session_user_id(db, session) if session else None
    if not s.auth_enabled:
        uid = svc.first_user_id(db)
    user = db.get(User, uid) if uid else None
    return {**info, "authenticated": bool(user), "user": svc.user_out(user) if user else None}


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    _throttle(request, "login", count=False)
    try:
        user = svc.authenticate(db, body.identifier, body.password)
    except svc.Unauthorized:
        _throttle(request, "login")
        raise
    _clear(request, "login")
    if svc.needs_verification(user):
        # Password was right but the email was never confirmed: send (or reuse) a code.
        if not svc.code_pending(user, "verify"):
            try:
                svc.send_code(db, user, "verify")
            except (svc.TooManyRequests, mail.MailUnavailable):
                pass
        raise svc.EmailUnverified(f"Confirm your email to sign in. We sent a code to {user.email}.", details={"email": user.email})
    return _sign_in(response, db, user)


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    if not get_settings().allow_registration:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Registration is closed")
    _throttle(request, "register")
    user = svc.create_user(db, body.username, body.email, body.password)
    svc.send_code(db, user, "verify")
    return {"pending_verification": True, "email": user.email, "username": user.username}


@router.post("/verify-email")
def verify_email(body: CodeIn, request: Request, response: Response, db: Session = Depends(get_db)):
    _throttle(request, "verify")
    user = svc.find_user(db, body.identifier)
    if user is None:
        raise svc.ValidationFailed("Wrong code", code="code_wrong")
    if not svc.needs_verification(user):
        raise svc.ValidationFailed("This email is already confirmed")
    svc.check_code(db, user, "verify", body.code.strip())
    user.email_verified_at = datetime.now(timezone.utc)
    db.commit()
    return _sign_in(response, db, user)


@router.post("/resend-code", status_code=204)
def resend_code(body: IdentifierIn, request: Request, db: Session = Depends(get_db)):
    _throttle(request, "resend")
    user = svc.find_user(db, body.identifier)
    if user is not None and svc.needs_verification(user):
        svc.send_code(db, user, "verify")


@router.post("/password/forgot", status_code=204)
def forgot_password(body: IdentifierIn, request: Request, db: Session = Depends(get_db)):
    """Always 204, so the response never tells whether an account exists."""
    _throttle(request, "forgot")
    user = svc.find_user(db, body.identifier)
    if user is not None and user.email and user.email_verified_at:
        try:
            svc.send_code(db, user, "reset")
        except svc.TooManyRequests:
            pass


@router.post("/password/reset")
def reset_password(body: ResetIn, request: Request, response: Response, db: Session = Depends(get_db)):
    _throttle(request, "reset")
    user = svc.find_user(db, body.identifier)
    if user is None:
        raise svc.ValidationFailed("Wrong code", code="code_wrong")
    svc.validate_password(body.password)
    svc.check_code(db, user, "reset", body.code.strip())
    svc.set_password(db, user, body.password)
    return _sign_in(response, db, user)


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(svc.SESSION_COOKIE, path="/")


# ------------------------------------------------------------------ signed-in account management

@router.post("/password/change", dependencies=[Depends(require_user)])
def change_password(body: ChangePasswordIn, request: Request, response: Response, db: Session = Depends(get_db)):
    _throttle(request, "change-password")
    user = db.get(User, current_user_id())
    if not svc.verify_password(body.current_password, user.password_hash):
        raise svc.ValidationFailed("Current password is wrong", code="password_wrong")
    svc.set_password(db, user, body.new_password)
    return _sign_in(response, db, user)  # this device stays signed in


@router.post("/email/change", dependencies=[Depends(require_user)])
def change_email(body: ChangeEmailIn, request: Request, db: Session = Depends(get_db)):
    _throttle(request, "change-email")
    user = db.get(User, current_user_id())
    if not svc.verify_password(body.password, user.password_hash):
        raise svc.ValidationFailed("Current password is wrong", code="password_wrong")
    email = svc.normalize_email(body.email)
    other = svc.find_user(db, email)
    if other is not None and other.id != user.id:
        raise svc.ValidationFailed("An account with this email already exists", code="email_taken")
    user.pending_email = email
    db.commit()
    svc.send_code(db, user, "change_email")
    return svc.user_out(user)


@router.post("/email/resend", dependencies=[Depends(require_user)])
def resend_change_email(db: Session = Depends(get_db)):
    user = db.get(User, current_user_id())
    svc.send_code(db, user, "change_email")
    return svc.user_out(user)


@router.post("/email/confirm", dependencies=[Depends(require_user)])
def confirm_email_change(body: ConfirmIn, db: Session = Depends(get_db)):
    user = db.get(User, current_user_id())
    if not user.pending_email:
        raise svc.ValidationFailed("There is no email change to confirm")
    svc.check_code(db, user, "change_email", body.code.strip())
    if svc.find_user(db, user.pending_email) not in (None, user):
        raise svc.ValidationFailed("An account with this email already exists", code="email_taken")
    user.email, user.pending_email = user.pending_email, None
    user.email_verified_at = datetime.now(timezone.utc)
    db.commit()
    return svc.user_out(user)


@router.delete("/me", status_code=204, dependencies=[Depends(require_user)])
def delete_account(body: DeleteAccountIn, request: Request, response: Response, db: Session = Depends(get_db)):
    """Permanently delete the signed-in account and all of its data."""
    _throttle(request, "delete-account")
    user = db.get(User, current_user_id())
    svc.delete_account(db, user, body.password)
    response.delete_cookie(svc.SESSION_COOKIE, path="/")


@router.delete("/email/change", dependencies=[Depends(require_user)])
def cancel_email_change(db: Session = Depends(get_db)):
    user = db.get(User, current_user_id())
    user.pending_email = None
    if user.code_purpose == "change_email":
        user.code_purpose = user.code_hash = user.code_expires_at = None
    db.commit()
    return svc.user_out(user)
