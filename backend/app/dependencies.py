"""FastAPI dependency helpers — current user, current device, body-aware HMAC."""
from __future__ import annotations

import uuid
from typing import Annotated, Tuple

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from . import hmac_verify
from .config import get_settings
from .database import get_db
from .models.device import Device
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
    return user, device_id


CurrentUser = Annotated[Tuple[User, uuid.UUID], Depends(get_current_user)]


def require_admin(current: CurrentUser) -> User:
    user, _ = current
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin only")
    return user


AdminUser = Annotated[User, Depends(require_admin)]


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
    try:
        hmac_verify.verify(
            header=x_device_signature,
            secret=device.device_secret,
            method=request.method,
            path=request.url.path,
            body=body,
            max_skew_sec=get_settings().hmac_clock_skew_sec,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"HMAC: {e}") from e
    return device


SignedDevice = Annotated[Device, Depends(verify_device_signature)]
