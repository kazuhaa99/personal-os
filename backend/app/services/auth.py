import hashlib
import hmac
import secrets
import time
from pathlib import Path

from app.config import get_settings

SESSION_COOKIE = "pos_session"
_KEY_FILE = Path(__file__).resolve().parents[2] / ".secret_key"
_key_cache: bytes | None = None


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


def check_credentials(username: str, password: str) -> bool:
    s = get_settings()
    # Evaluate both comparisons so timing does not reveal which one failed.
    ok_user = secrets.compare_digest(username.encode(), s.auth_username.encode())
    ok_pass = secrets.compare_digest(password.encode(), s.auth_password.encode())
    return ok_user and ok_pass


def create_session(username: str) -> str:
    expires = int(time.time()) + get_settings().session_days * 86400
    payload = f"{username}|{expires}|{secrets.token_hex(8)}"
    return f"{payload}|{_sign(payload)}"


def verify_session(token: str) -> str | None:
    """Returns the username for a valid, unexpired session, else None."""
    payload, _, sig = token.rpartition("|")
    if not payload or not hmac.compare_digest(sig, _sign(payload)):
        return None
    username, _, rest = payload.partition("|")
    expires = rest.partition("|")[0]
    if not expires.isdigit() or int(expires) < time.time():
        return None
    # A session for a username that was since changed is no longer valid.
    if username != get_settings().auth_username:
        return None
    return username
