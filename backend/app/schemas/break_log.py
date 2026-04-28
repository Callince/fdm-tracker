"""Break schemas."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class BreakStartRequest(BaseModel):
    session_id: uuid.UUID
    started_at: datetime
    reason: Optional[str] = Field(default=None, max_length=255)


class BreakStartResponse(BaseModel):
    break_id: uuid.UUID


class BreakEndRequest(BaseModel):
    break_id: uuid.UUID
    ended_at: datetime


class BreakEndResponse(BaseModel):
    break_id: uuid.UUID
    ended_at: datetime


class BreakOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    started_at: datetime
    ended_at: Optional[datetime]
    reason: Optional[str]
