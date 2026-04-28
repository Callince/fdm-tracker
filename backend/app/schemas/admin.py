"""Admin-facing schemas."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


LiveStatus = Literal["active", "idle", "on_break", "offline"]


class AdminUserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    role: Literal["user", "admin"] = "user"
    position: Optional[str] = Field(default=None, max_length=128)
    team_id: Optional[uuid.UUID] = None
    timezone: str = Field(default="Asia/Kolkata", max_length=64)


class AdminUserUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=256)
    role: Optional[Literal["user", "admin"]] = None
    position: Optional[str] = Field(default=None, max_length=128)
    team_id: Optional[uuid.UUID] = None
    timezone: Optional[str] = Field(default=None, max_length=64)
    is_active: Optional[bool] = None


class AdminUserDetail(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: Literal["user", "admin"]
    position: Optional[str]
    team_id: Optional[uuid.UUID]
    team_name: Optional[str]
    timezone: str
    is_active: bool


class AdminUserRow(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: Literal["user", "admin"]
    position: Optional[str]
    team_id: Optional[uuid.UUID]
    team_name: Optional[str]
    timezone: str
    is_active: bool
    status: LiveStatus
    today_active_seconds: int
    today_idle_seconds: int
    today_break_seconds: int
    last_seen_at: Optional[datetime]


class AdminUserList(BaseModel):
    users: List[AdminUserRow]


class LiveSnapshot(BaseModel):
    generated_at: datetime
    users: List[AdminUserRow]


class ReportRow(BaseModel):
    user_id: uuid.UUID
    name: str
    email: str
    date: str
    active_hours: float
    idle_hours: float
    break_hours: float


class ReportResponse(BaseModel):
    from_date: str
    to_date: str
    rows: List[ReportRow]


class TrendDay(BaseModel):
    date: str
    active_hours: float
    idle_hours: float
    break_hours: float


class TeamTrendResponse(BaseModel):
    from_date: str
    to_date: str
    days: List[TrendDay]


class TeamOverview(BaseModel):
    total_users: int
    active_now: int
    on_break_now: int
    team_active_seconds_today: int
    team_break_seconds_today: int
    team_idle_seconds_today: int
