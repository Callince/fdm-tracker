"""Meeting schemas."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    meeting_link: Optional[str] = Field(default=None, max_length=1024)
    scheduled_at: datetime
    duration_minutes: int = Field(default=30, ge=1, le=1440)
    team_id: Optional[uuid.UUID] = None


class MeetingUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    meeting_link: Optional[str] = Field(default=None, max_length=1024)
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    team_id: Optional[uuid.UUID] = None


class MeetingOut(BaseModel):
    id: uuid.UUID
    title: str
    meeting_link: Optional[str]
    scheduled_at: datetime
    duration_minutes: int
    team_id: Optional[uuid.UUID]
    team_name: Optional[str]
    created_at: datetime


class MeetingList(BaseModel):
    meetings: List[MeetingOut]
