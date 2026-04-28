"""Calendar / summary schemas."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel

from .break_log import BreakOut  # noqa: F401 -- used indirectly
from .session import SessionOut


class DailySummaryOut(BaseModel):
    date: date
    total_active_seconds: int
    total_idle_seconds: int
    total_break_seconds: int
    first_activity_at: Optional[datetime]
    last_activity_at: Optional[datetime]


class ActivityBucketOut(BaseModel):
    bucket_start: datetime
    active_seconds: int
    idle_seconds: int
    keystroke_count: int
    mouse_event_count: int


class DayDetailResponse(BaseModel):
    user_id: uuid.UUID
    date: date
    timezone: str
    sessions: List[SessionOut]
    breaks: List[BreakOut]
    buckets: List[ActivityBucketOut]
    totals: DailySummaryOut


class DailySummaryListResponse(BaseModel):
    timezone: str
    days: List[DailySummaryOut]
