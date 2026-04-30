"""Per-IP rate limiting for auth endpoints.

A small in-memory token-bucket / sliding-window keyed by IP. Implemented
as plain `Depends(...)` callables so it composes cleanly with FastAPI's
type-hint resolution under `from __future__ import annotations` — slowapi
v0.1.x's `@limiter.limit` decorator broke that path.

With multiple workers each gets its own counter, so the effective ceiling
is `limit * workers`. That's good-enough for the brute-force /
enumeration threat model on a 2-worker deploy. For stricter limits, swap
this out for a Redis-backed implementation.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from fastapi import HTTPException, Request, status


_lock = threading.Lock()
_buckets: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)


def _client_key(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "anon"


def _check(scope: str, request: Request, *, limit: int, window_sec: int) -> None:
    key = (scope, _client_key(request))
    now = time.monotonic()
    cutoff = now - window_sec
    with _lock:
        q = _buckets[key]
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= limit:
            retry_in = int(q[0] - cutoff) + 1 if q else window_sec
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"rate limit exceeded; retry in ~{retry_in}s",
                headers={"Retry-After": str(retry_in)},
            )
        q.append(now)


def rate_limit(scope: str, *, per_minute: int | None = None, per_hour: int | None = None):
    """Returns a Depends-callable enforcing the given limits.

    Both windows are checked independently — per_minute=5 and per_hour=30
    means: at most 5 in any 60s window AND at most 30 in any 3600s window.
    """

    def _dep(request: Request) -> None:
        if per_minute is not None:
            _check(f"{scope}:m", request, limit=per_minute, window_sec=60)
        if per_hour is not None:
            _check(f"{scope}:h", request, limit=per_hour, window_sec=3600)

    return _dep


# For tests.
def _reset() -> None:
    with _lock:
        _buckets.clear()
