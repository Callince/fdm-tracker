"""JWT + password helpers."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Literal

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import get_settings

_settings = get_settings()

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=_settings.bcrypt_rounds)

TokenKind = Literal["access", "refresh"]


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def _create_token(sub: uuid.UUID, kind: TokenKind, ttl_min: int, extra: Dict[str, Any] | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload: Dict[str, Any] = {
        "sub": str(sub),
        "kind": kind,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ttl_min)).timestamp()),
        "jti": str(uuid.uuid4()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, _settings.jwt_secret, algorithm=_settings.jwt_algorithm)


def create_access_token(user_id: uuid.UUID, device_id: uuid.UUID, role: str) -> str:
    return _create_token(
        user_id,
        "access",
        _settings.access_token_ttl_min,
        {"device_id": str(device_id), "role": role},
    )


def create_refresh_token(user_id: uuid.UUID, device_id: uuid.UUID) -> str:
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
