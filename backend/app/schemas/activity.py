"""Activity-batch schemas."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List

from pydantic import BaseModel, Field, field_validator


class ActivityBucket(BaseModel):
    client_event_id: uuid.UUID
    session_id: uuid.UUID
    bucket_start: datetime  # UTC
    active_seconds: int = Field(ge=0, le=60)
    idle_seconds: int = Field(ge=0, le=60)
    keystroke_count: int = Field(ge=0, le=100_000)
    mouse_event_count: int = Field(ge=0, le=100_000)

    @field_validator("bucket_start")
    @classmethod
    def _tz_aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("bucket_start must be timezone-aware UTC")
        return v


class ActivityBatchRequest(BaseModel):
    buckets: List[ActivityBucket] = Field(min_length=1, max_length=500)


class ActivityBatchResponse(BaseModel):
    accepted: int
    deduplicated: int
    rejected: int
    reasons: List[str] = Field(default_factory=list)
