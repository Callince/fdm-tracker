"""Authentication and device-registration schemas."""
from __future__ import annotations

import uuid
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    device_label: str = Field(min_length=1, max_length=255)
    device_platform: Literal["darwin", "win32", "linux"]
    device_fingerprint: str = Field(min_length=8, max_length=128)


class DeviceCredential(BaseModel):
    """Returned only on first login from a device (or re-registration)."""

    device_id: uuid.UUID
    device_secret: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int  # seconds


class LoginResponse(BaseModel):
    tokens: TokenPair
    device: DeviceCredential
    user_id: uuid.UUID
    name: str
    role: Literal["user", "admin"]
    position: Optional[str]
    team_id: Optional[uuid.UUID]
    team_name: Optional[str]
    timezone: str
    is_new_device: bool
    idle_threshold_minutes: int
    target_hours_per_day: int


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int


class LogoutRequest(BaseModel):
    session_id: Optional[uuid.UUID] = None


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    position: Optional[str] = Field(default=None, max_length=128)
    team_id: Optional[uuid.UUID] = None
    timezone: str = Field(default="Asia/Kolkata", max_length=64)


class SignupResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: Literal["user", "admin"]
    position: Optional[str]
    team_id: Optional[uuid.UUID]
    team_name: Optional[str]
    timezone: str
    is_active: bool
    verification_required: bool
    message: str


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class SimpleMessage(BaseModel):
    message: str
