"""Brute-force brake for the sign-in endpoints, kept in this process's memory (one worker).

At most MAX attempts per client address and action in WINDOW seconds, and ACCOUNT_MAX failed
sign-ins per account from anywhere, so rotating addresses doesn't help. Addresses that signed
in to an account successfully before are exempt from that account's limit, so a stranger's
guessing can't lock its owner out of their own devices.
"""

import threading
import time
from collections import deque
from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import HTTPException, Request, status

from app.services.auth import Unauthorized

WINDOW, MAX, ACCOUNT_MAX = 300, 10, 20
MAX_KEYS = 10_000  # memory cap per table: beyond it the least recently used entries are forgotten
TRUSTED_FOR = 30 * 86400  # how long a successful sign-in exempts its address from the account limit

_hits: dict[tuple[str, str], deque[float]] = {}
_trusted: dict[tuple[int, str], float] = {}  # (user id, address) -> last successful sign-in
_lock = threading.Lock()

Key = tuple[str, str]


def reset() -> None:
    with _lock:
        _hits.clear()
        _trusted.clear()


def client(request: Request) -> str:
    return request.client.host if request.client else "?"


def _make_room(table: dict, last_used, now: float, max_age: float) -> None:
    """Drop stale entries; if still full, the least recently used ones."""
    for key in [k for k, v in table.items() if last_used(v) < now - max_age]:
        del table[key]
    excess = len(table) - MAX_KEYS + 1
    if excess > 0:
        for key in sorted(table, key=lambda k: last_used(table[k]))[:excess]:
            del table[key]


def take(key: Key, limit: int = MAX) -> float:
    """Count one attempt under key, or refuse (429) when its window is already full."""
    now = time.time()
    with _lock:
        if key not in _hits and len(_hits) >= MAX_KEYS:
            _make_room(_hits, lambda q: q[-1] if q else 0.0, now, WINDOW)
        q = _hits.setdefault(key, deque())
        while q and q[0] < now - WINDOW:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Try again in a few minutes.")
        q.append(now)
    return now


def give_back(key: Key, stamp: float) -> None:
    with _lock:
        q = _hits.get(key)
        if q is not None and stamp in q:
            q.remove(stamp)


def per_client(request: Request, action: str) -> None:
    """Every attempt counts (registration, code checks, account changes)."""
    take((action, client(request)))


def trusted(user_id: int, address: str) -> bool:
    with _lock:
        seen = _trusted.get((user_id, address))
    return seen is not None and seen > time.time() - TRUSTED_FOR


def remember(user_id: int, address: str) -> None:
    now = time.time()
    with _lock:
        if (user_id, address) not in _trusted and len(_trusted) >= MAX_KEYS:
            _make_room(_trusted, lambda seen: seen, now, TRUSTED_FOR)
        _trusted[(user_id, address)] = now


@contextmanager
def failures_only(request: Request, action: str, account: str | None = None) -> Iterator[None]:
    """Only failed attempts (Unauthorized) count. Each attempt is counted before it runs and given
    back if it didn't fail, so a burst of parallel requests can't slip past the limit."""
    keys = [((action, client(request)), MAX)]
    if account is not None:
        keys.append(((f"{action}:account", account), ACCOUNT_MAX))
    taken: list[tuple[Key, float]] = []
    try:
        for key, limit in keys:
            taken.append((key, take(key, limit)))
        yield
    except Unauthorized:
        raise
    except BaseException:
        for key, stamp in taken:
            give_back(key, stamp)
        raise
    for key, stamp in taken:
        give_back(key, stamp)
