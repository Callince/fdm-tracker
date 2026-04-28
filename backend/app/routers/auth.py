"""Auth + device registration."""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..dependencies import CurrentUser
from ..models.device import Device
from ..models.settings import Settings as OrgSettings
from ..models.user import User
from ..schemas.auth import (
    DeviceCredential,
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    RefreshResponse,
    ResendVerificationRequest,
    SignupRequest,
    SignupResponse,
    SimpleMessage,
    TokenPair,
    VerifyEmailRequest,
)
from ..security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from ..services.verification import VerificationError, issue_and_send, verify as verify_code
from ..routers.teams import ensure_team_exists
from ..models.team import Team
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

router = APIRouter(prefix="/auth", tags=["auth"])


def _enforce_allowed_domain(email: str) -> None:
    domain = email.rsplit("@", 1)[-1].lower()
    allowed = get_settings().allowed_signup_domains_set
    if domain not in allowed:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"email domain not allowed; use one of: {', '.join(sorted(allowed))}",
        )


def _validate_timezone(tz: str) -> None:
    try:
        ZoneInfo(tz)
    except ZoneInfoNotFoundError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown timezone: {tz}") from e


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
def signup(
    body: SignupRequest,
    db: Annotated[Session, Depends(get_db)],
) -> SignupResponse:
    email = body.email.lower()
    _enforce_allowed_domain(email)
    _validate_timezone(body.timezone)
    ensure_team_exists(db, body.team_id)

    existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")

    u = User(
        name=body.name,
        email=email,
        password_hash=hash_password(body.password),
        role="user",                # self-signup can never create admins
        position=body.position,
        team_id=body.team_id,
        timezone=body.timezone,
        is_active=True,
        email_verified_at=None,     # blocked from login until verification
    )
    db.add(u)
    db.flush()
    try:
        issue_and_send(db, u, enforce_cooldown=False)
    except VerificationError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    db.commit()
    db.refresh(u)
    team_name = None
    if u.team_id is not None:
        t = db.get(Team, u.team_id)
        team_name = t.name if t else None
    return SignupResponse(
        id=u.id,
        name=u.name,
        email=u.email,
        role=u.role,  # type: ignore[arg-type]
        position=u.position,
        team_id=u.team_id,
        team_name=team_name,
        timezone=u.timezone,
        is_active=u.is_active,
        verification_required=True,
        message=f"verification code sent to {u.email}; it expires in {get_settings().verification_code_ttl_min} minutes",
    )


@router.post("/verify-email", response_model=SimpleMessage)
def verify_email(
    body: VerifyEmailRequest,
    db: Annotated[Session, Depends(get_db)],
) -> SimpleMessage:
    user = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if user is None:
        # Don't confirm/deny account existence.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid code")
    if user.email_verified_at is not None:
        return SimpleMessage(message="already verified")
    try:
        verify_code(db, user, body.code)
    except VerificationError as e:
        db.commit()  # persist attempt counter / invalidations
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    db.commit()
    return SimpleMessage(message="email verified — you can now log in")


@router.post("/resend-verification", response_model=SimpleMessage)
def resend_verification(
    body: ResendVerificationRequest,
    db: Annotated[Session, Depends(get_db)],
) -> SimpleMessage:
    user = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    # Generic response in both branches to avoid account enumeration.
    generic = SimpleMessage(message="if the account exists and is unverified, a new code has been sent")
    if user is None or user.email_verified_at is not None:
        return generic
    try:
        issue_and_send(db, user, enforce_cooldown=True)
    except VerificationError as e:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(e)) from e
    db.commit()
    return generic


@router.post("/login", response_model=LoginResponse)
def login(
    req: LoginRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> LoginResponse:
    user = db.execute(select(User).where(User.email == req.email.lower())).scalar_one_or_none()
    if user is None or not verify_password(req.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "account disabled")
    if user.email_verified_at is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "email not verified — check your inbox for the 6-digit code",
        )

    device = db.execute(
        select(Device).where(
            and_(Device.user_id == user.id, Device.fingerprint == req.device_fingerprint)
        )
    ).scalar_one_or_none()

    is_new = False
    if device is None:
        is_new = True
        device = Device(
            user_id=user.id,
            label=req.device_label[:255],
            platform=req.device_platform,
            fingerprint=req.device_fingerprint,
            device_secret=secrets.token_urlsafe(48),
        )
        db.add(device)
    # Re-issue secret on explicit re-login to rotate it? We keep existing
    # secret on returning devices so the client does not need to re-persist.
    device.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(device)

    access = create_access_token(user.id, device.id, user.role)
    refresh = create_refresh_token(user.id, device.id)
    settings_row = db.get(OrgSettings, 1) or OrgSettings(id=1)

    team_name = None
    if user.team_id is not None:
        t = db.get(Team, user.team_id)
        team_name = t.name if t else None

    return LoginResponse(
        tokens=TokenPair(
            access_token=access,
            refresh_token=refresh,
            expires_in=get_settings().access_token_ttl_min * 60,
        ),
        device=DeviceCredential(device_id=device.id, device_secret=device.device_secret),
        user_id=user.id,
        name=user.name,
        role=user.role,  # type: ignore[arg-type]
        position=user.position,
        team_id=user.team_id,
        team_name=team_name,
        timezone=user.timezone,
        is_new_device=is_new,
        idle_threshold_minutes=settings_row.idle_threshold_minutes,
        target_hours_per_day=settings_row.target_hours_per_day,
    )


@router.post("/refresh", response_model=RefreshResponse)
def refresh(
    req: RefreshRequest, db: Annotated[Session, Depends(get_db)]
) -> RefreshResponse:
    try:
        payload = decode_token(req.refresh_token)
    except ValueError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e
    if payload.get("kind") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not a refresh token")
    user_id = uuid.UUID(payload["sub"])
    device_id = uuid.UUID(payload["device_id"])
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user invalid")
    device = db.get(Device, device_id)
    if device is None or device.user_id != user.id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "device invalid")
    access = create_access_token(user.id, device.id, user.role)
    return RefreshResponse(access_token=access, expires_in=get_settings().access_token_ttl_min * 60)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout(current: CurrentUser) -> Response:
    # Stateless JWT; client discards tokens. We do not keep a denylist.
    return Response(status_code=status.HTTP_204_NO_CONTENT)
