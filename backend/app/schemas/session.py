"""Work-session schemas."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SessionStartRequest(BaseModel):
    started_at: datetime  # client's local timestamp (must be UTC-aware)


class SessionStartResponse(BaseModel):
    session_id: uuid.UUID
    started_at: datetime


class SessionEndRequest(BaseModel):
    session_id: uuid.UUID
    ended_at: datetime


class SessionEndResponse(BaseModel):
    session_id: uuid.UUID
    ended_at: datetime


class SessionOut(BaseModel):
    id: uuid.UUID
    started_at: datetime
    ended_at: Optional[datetime]
