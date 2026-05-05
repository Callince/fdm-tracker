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
    # Single source of truth for team-name length. Old DB column is
    # String(255) but the UI allotment is 50 chars; enforce that here so
    # admin and public routes can't disagree.
    name: str = Field(min_length=1, max_length=50)


class TeamUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
