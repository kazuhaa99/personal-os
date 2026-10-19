import secrets

from fastapi import Header, HTTPException, status

from app.config import get_settings


def require_token(authorization: str | None = Header(default=None)) -> None:
    """Bearer-token gate, active only when POS_API_TOKEN is configured.

    This is a shared-secret check for a single-user deployment, not a user
    account system. Use HTTPS (e.g. a reverse proxy) if the token crosses a network.
    """
    expected = get_settings().api_token
    if not expected:
        return
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(token.encode(), expected.encode()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API token",
            headers={"WWW-Authenticate": "Bearer"},
        )
