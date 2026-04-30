"""Meeting schemas."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


# 5 min slack so a network round-trip doesn't cause "past" rejections.
PAST_SLACK = timedelta(minutes=5)


def _ensure_future(v: datetime) -> datetime:
    now = datetime.now(timezone.utc)
    # Pydantic gives us a timezone-aware datetime if the request includes one;
    # naive inputs are treated as UTC.
    candidate = v if v.tzinfo is not None else v.replace(tzinfo=timezone.utc)
    if candidate < now - PAST_SLACK:
        raise ValueError("scheduled_at must be the current date/time or in the future")
    return v


def _normalize_link(v: Optional[str]) -> Optional[str]:
    """Accept blank/None as 'no link'. If a value is supplied, it must be an
    absolute http(s) URL — pasting a calendar description string ('To join the
    meeting, click https://...') breaks the join button on the admin page,
    so we strip surrounding text and pull the first URL instead of rejecting."""
    if v is None:
        return None
    s = v.strip()
    if not s:
        return None
    # Already a clean http(s) URL — common case.
    if s.startswith("http://") or s.startswith("https://"):
        return s
    # Try to extract the first http(s) URL from a freeform string.
    import re
    m = re.search(r"https?://\S+", s)
    if m:
        return m.group(0)
    raise ValueError("meeting_link must be a full http or https URL")


class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    meeting_link: Optional[str] = Field(default=None, max_length=1024)
    meeting_password: Optional[str] = Field(default=None, max_length=128)
    scheduled_at: datetime
    duration_minutes: int = Field(default=30, ge=1, le=1440)
    user_ids: List[uuid.UUID] = Field(
        default_factory=list,
        description="Empty list = broadcast to all users.",
    )

    _check_future = field_validator("scheduled_at")(_ensure_future)
    _norm_link = field_validator("meeting_link")(_normalize_link)


class MeetingUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    meeting_link: Optional[str] = Field(default=None, max_length=1024)
    meeting_password: Optional[str] = Field(default=None, max_length=128)
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    user_ids: Optional[List[uuid.UUID]] = None

    # Admin may edit a meeting's time freely (e.g. fix a typo on a meeting
    # that's already started). Past times are only blocked on create.

    @field_validator("meeting_link")
    @classmethod
    def _validate_link(cls, v: Optional[str]) -> Optional[str]:
        return _normalize_link(v)


class AttendeeBrief(BaseModel):
    id: uuid.UUID
    name: str
    email: str


class MeetingOut(BaseModel):
    id: uuid.UUID
    title: str
    meeting_link: Optional[str]
    meeting_password: Optional[str]
    scheduled_at: datetime
    duration_minutes: int
    attendees: List[AttendeeBrief]
    created_at: datetime


class MeetingList(BaseModel):
    meetings: List[MeetingOut]
