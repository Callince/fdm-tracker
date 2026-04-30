"""JWT + password helpers."""
from __future__ import annotations

import hmac as _hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Literal, Tuple

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import get_settings

_settings = get_settings()

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=_settings.bcrypt_rounds)

# Pre-computed bcrypt of a random secret. We hash-verify against this on
# the user-not-found branch of login to keep response time roughly
# constant and prevent email enumeration via timing.
DUMMY_PASSWORD_HASH = _pwd.hash(secrets.token_urlsafe(32))

TokenKind = Literal["access", "refresh"]


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def constant_time_dummy_verify() -> None:
    """Run a bcrypt verification against a throwaway hash so the
    user-not-found code path takes the same time as the found path."""
    _pwd.verify("not-the-password", DUMMY_PASSWORD_HASH)


def _create_token(
    sub: uuid.UUID, kind: TokenKind, ttl_min: int, extra: Dict[str, Any] | None = None
) -> Tuple[str, str]:
    now = datetime.now(timezone.utc)
    jti = uuid.uuid4().hex
    payload: Dict[str, Any] = {
        "sub": str(sub),
        "kind": kind,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ttl_min)).timestamp()),
        "jti": jti,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, _settings.jwt_secret, algorithm=_settings.jwt_algorithm), jti


def create_access_token(user_id: uuid.UUID, device_id: uuid.UUID, role: str) -> str:
    token, _ = _create_token(
        user_id,
        "access",
        _settings.access_token_ttl_min,
        {"device_id": str(device_id), "role": role},
    )
    return token


def create_refresh_token(user_id: uuid.UUID, device_id: uuid.UUID) -> Tuple[str, str]:
    """Returns (token, jti). Caller must persist jti on the device row."""
    return _create_token(
        user_id,
        "refresh",
        _settings.refresh_token_ttl_min,
        {"device_id": str(device_id)},
    )


def decode_token(token: str) -> Dict[str, Any]:
    try:
        data: Dict[str, Any] = jwt.decode(token, _settings.jwt_secret, algorithms=[_settings.jwt_algorithm])
        return data
    except JWTError as e:
        raise ValueError(f"invalid token: {e}") from e


def jti_matches(expected: str | None, actual: str | None) -> bool:
    if expected is None or actual is None:
        return False
    return _hmac.compare_digest(expected, actual)
