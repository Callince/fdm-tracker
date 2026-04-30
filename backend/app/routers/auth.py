"""Auth + device registration."""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ..config import get_settings
from ..database import get_db
from ..dependencies import CurrentUser
from ..models.device import Device
from ..models.settings import Settings as OrgSettings
from ..models.team import Team
from ..models.user import User
from ..rate_limit import rate_limit
from ..routers.teams import ensure_team_exists
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
    constant_time_dummy_verify,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    jti_matches,
    verify_password,
)
from ..services.verification import VerificationError, issue_and_send, verify as verify_code

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


def _team_name(db: Session, team_id: uuid.UUID | None) -> str | None:
    if team_id is None:
        return None
    t = db.get(Team, team_id)
    return t.name if t else None


@router.post(
    "/signup",
    response_model=SignupResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("signup", per_minute=3, per_hour=10))],
)
def signup(
    body: SignupRequest,
    background: BackgroundTasks,
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
        issue_and_send(db, u, enforce_cooldown=False, background=background)
    except VerificationError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    db.commit()
    db.refresh(u)
    return SignupResponse(
        id=u.id,
        name=u.name,
        email=u.email,
        role=u.role,  # type: ignore[arg-type]
        position=u.position,
        team_id=u.team_id,
        team_name=_team_name(db, u.team_id),
        timezone=u.timezone,
        is_active=u.is_active,
        verification_required=True,
        message=f"verification code sent to {u.email}; it expires in {get_settings().verification_code_ttl_min} minutes",
    )


@router.post(
    "/verify-email",
    response_model=SimpleMessage,
    dependencies=[Depends(rate_limit("verify", per_minute=10, per_hour=60))],
)
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


@router.post(
    "/resend-verification",
    response_model=SimpleMessage,
    dependencies=[Depends(rate_limit("resend", per_minute=3, per_hour=15))],
)
def resend_verification(
    body: ResendVerificationRequest,
    background: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
) -> SimpleMessage:
    user = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    # Generic response in both branches to avoid account enumeration.
    generic = SimpleMessage(message="if the account exists and is unverified, a new code has been sent")
    if user is None or user.email_verified_at is not None:
        return generic
    try:
        issue_and_send(db, user, enforce_cooldown=True, background=background)
    except VerificationError as e:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(e)) from e
    db.commit()
    return generic


@router.post(
    "/login",
    response_model=LoginResponse,
    dependencies=[Depends(rate_limit("login", per_minute=5, per_hour=30))],
)
def login(
    request: Request,
    req: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
) -> LoginResponse:
    user = db.execute(select(User).where(User.email == req.email.lower())).scalar_one_or_none()

    # Constant-time path: always run a bcrypt verification so the not-found
    # and wrong-password cases take roughly the same wall-clock time.
    if user is None:
        constant_time_dummy_verify()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    if not verify_password(req.password, user.password_hash):
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
            label=req.device_label,
            platform=req.device_platform,
            fingerprint=req.device_fingerprint,
            device_secret=secrets.token_urlsafe(48),
        )
        db.add(device)
        db.flush()

    access = create_access_token(user.id, device.id, user.role)
    refresh, refresh_jti = create_refresh_token(user.id, device.id)
    device.refresh_token_jti = refresh_jti
    device.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(device)

    settings_row = db.get(OrgSettings, 1) or OrgSettings(id=1)

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
        team_name=_team_name(db, user.team_id),
        timezone=user.timezone,
        is_new_device=is_new,
        idle_threshold_minutes=settings_row.idle_threshold_minutes,
        target_hours_per_day=settings_row.target_hours_per_day,
    )


@router.post(
    "/refresh",
    response_model=RefreshResponse,
    dependencies=[Depends(rate_limit("refresh", per_minute=10, per_hour=100))],
)
def refresh(
    req: RefreshRequest,
    db: Annotated[Session, Depends(get_db)],
) -> RefreshResponse:
    try:
        payload = decode_token(req.refresh_token)
    except ValueError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e
    if payload.get("kind") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not a refresh token")
    user_id = uuid.UUID(payload["sub"])
    device_id = uuid.UUID(payload["device_id"])
    presented_jti = payload.get("jti")

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user invalid")
    device = db.get(Device, device_id)
    if device is None or device.user_id != user.id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "device invalid")

    if user.password_changed_at is not None:
        iat = payload.get("iat")
        if iat is None or datetime.fromtimestamp(int(iat), tz=timezone.utc) < user.password_changed_at:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token revoked")

    # Refresh-token rotation: presented jti must match the latest one we
    # minted for this device. Any mismatch (stale or replayed leak) clears
    # the slot — user must log in again.
    if not jti_matches(device.refresh_token_jti, presented_jti):
        device.refresh_token_jti = None
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "refresh token reuse detected")

    new_refresh, new_jti = create_refresh_token(user.id, device.id)
    device.refresh_token_jti = new_jti
    device.last_seen_at = datetime.now(timezone.utc)
    access = create_access_token(user.id, device.id, user.role)
    db.commit()

    return RefreshResponse(
        access_token=access,
        refresh_token=new_refresh,
        expires_in=get_settings().access_token_ttl_min * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout(current: CurrentUser, db: Annotated[Session, Depends(get_db)]) -> Response:
    """Server-side logout: clears the device's refresh-token jti so any
    outstanding refresh attempt is rejected. The access token remains
    valid until expiry but is bound to this device for HMAC ops."""
    _, device_id = current
    device = db.get(Device, device_id)
    if device is not None:
        device.refresh_token_jti = None
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
