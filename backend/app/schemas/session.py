"""Work-session schemas."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SessionStartRequest(BaseModel):
    """Body kept for backward compat with desktop clients; the server
    uses its own clock as the authoritative `started_at`."""
    started_at: Optional[datetime] = None


class SessionStartResponse(BaseModel):
    session_id: uuid.UUID
    started_at: datetime


class SessionEndRequest(BaseModel):
    session_id: uuid.UUID
    ended_at: Optional[datetime] = None  # ignored; server clock wins


class SessionEndResponse(BaseModel):
    session_id: uuid.UUID
    ended_at: datetime


class SessionOut(BaseModel):
    id: uuid.UUID
    started_at: datetime
    ended_at: Optional[datetime]
