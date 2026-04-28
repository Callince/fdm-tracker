"""Team schemas."""
from __future__ import annotations

import uuid
from typing import List, Optional

from pydantic import BaseModel, Field


class TeamBrief(BaseModel):
    id: uuid.UUID
    name: str


class TeamOut(TeamBrief):
    member_count: int


class TeamListResponse(BaseModel):
    teams: List[TeamOut]


class PublicTeamListResponse(BaseModel):
    """Signup dropdown — id + name only."""

    teams: List[TeamBrief]


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)


class TeamUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=128)
