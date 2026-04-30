"""FastAPI dependency helpers — current user, current device, body-aware HMAC."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Tuple

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import hmac_verify
from .config import get_settings
from .database import get_db
from .models.device import Device
from .models.hmac_nonce import HmacNonce
from .models.user import User
from .security import decode_token


def _bearer_from_header(auth: str | None) -> str:
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    return auth.split(" ", 1)[1].strip()


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> Tuple[User, uuid.UUID]:
    """Returns (user, device_id) from the access JWT."""
    token = _bearer_from_header(authorization)
    try:
        payload = decode_token(token)
    except ValueError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e
    if payload.get("kind") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not an access token")
    user_id = uuid.UUID(payload["sub"])
    device_id = uuid.UUID(payload["device_id"])
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found / inactive")
    if user.password_changed_at is not None:
        iat = payload.get("iat")
        if iat is None or datetime.fromtimestamp(int(iat), tz=timezone.utc) < user.password_changed_at:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token revoked")
    return user, device_id


CurrentUser = Annotated[Tuple[User, uuid.UUID], Depends(get_current_user)]


def require_admin(current: CurrentUser) -> User:
    user, _ = current
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin only")
    return user


AdminUser = Annotated[User, Depends(require_admin)]


def _record_nonce(db: Session, device_id: uuid.UUID, mac_hex: str, ttl_sec: int) -> None:
    expires = datetime.now(timezone.utc) + timedelta(seconds=ttl_sec)
    db.add(HmacNonce(device_id=device_id, mac_hex=mac_hex, expires_at=expires))
    try:
        db.flush()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "HMAC: replay detected") from e


def _gc_expired_nonces(db: Session) -> None:
    db.execute(delete(HmacNonce).where(HmacNonce.expires_at < datetime.now(timezone.utc)))


async def verify_device_signature(
    request: Request,
    current: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    x_device_signature: Annotated[str | None, Header()] = None,
) -> Device:
    """Verifies HMAC on mutating endpoints. Returns the Device row."""
    user, device_id = current
    device = db.get(Device, device_id)
    if device is None or device.user_id != user.id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "device not found")
    body = await request.body()
    skew = get_settings().hmac_clock_skew_sec
    try:
        parsed = hmac_verify.verify(
            header=x_device_signature,
            secret=device.device_secret,
            method=request.method,
            path=request.url.path,
            body=body,
            max_skew_sec=skew,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"HMAC: {e}") from e
    # Replay protection: insert (device_id, mac_hex). Composite PK rejects duplicates.
    _record_nonce(db, device.id, parsed.mac_hex, ttl_sec=skew * 2)
    # NOTE: do NOT run _gc_expired_nonces here. It used to be called on every
    # request — fine when the table was empty, catastrophic once it accumulated
    # tens of thousands of rows (full-table DELETE in the request path made
    # every signed POST take minutes). The garbage collection now runs in a
    # periodic background task; see app.main:_nonce_gc_loop.
    return device


SignedDevice = Annotated[Device, Depends(verify_device_signature)]
