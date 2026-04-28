"""Teams — public read-only list for signup, admin CRUD for management."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import AdminUser
from ..models.team import Team
from ..models.user import User
from ..schemas.team import (
    PublicTeamListResponse,
    TeamBrief,
    TeamCreate,
    TeamListResponse,
    TeamOut,
    TeamUpdate,
)

public_router = APIRouter(prefix="/teams", tags=["teams"])
admin_router = APIRouter(prefix="/admin/teams", tags=["admin-teams"])


@public_router.get("", response_model=PublicTeamListResponse)
def list_public_teams(db: Annotated[Session, Depends(get_db)]) -> PublicTeamListResponse:
    rows = db.execute(select(Team).order_by(Team.name.asc())).scalars().all()
    return PublicTeamListResponse(teams=[TeamBrief(id=t.id, name=t.name) for t in rows])


def _with_counts(db: Session) -> list[TeamOut]:
    stmt = (
        select(Team.id, Team.name, func.count(User.id))
        .join(User, User.team_id == Team.id, isouter=True)
        .group_by(Team.id, Team.name)
        .order_by(Team.name.asc())
    )
    out: list[TeamOut] = []
    for tid, name, count in db.execute(stmt).all():
        out.append(TeamOut(id=tid, name=name, member_count=int(count)))
    return out


@admin_router.get("", response_model=TeamListResponse)
def admin_list_teams(
    admin: AdminUser, db: Annotated[Session, Depends(get_db)]
) -> TeamListResponse:
    return TeamListResponse(teams=_with_counts(db))


@admin_router.post("", response_model=TeamOut, status_code=status.HTTP_201_CREATED)
def admin_create_team(
    body: TeamCreate, admin: AdminUser, db: Annotated[Session, Depends(get_db)]
) -> TeamOut:
    name = body.name.strip()
    existing = db.execute(select(Team).where(func.lower(Team.name) == name.lower())).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "team name already exists")
    team = Team(name=name)
    db.add(team)
    db.commit()
    db.refresh(team)
    return TeamOut(id=team.id, name=team.name, member_count=0)


@admin_router.patch("/{team_id}", response_model=TeamOut)
def admin_update_team(
    team_id: uuid.UUID,
    body: TeamUpdate,
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> TeamOut:
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "team not found")
    if body.name is not None:
        new_name = body.name.strip()
        clash = db.execute(
            select(Team).where(func.lower(Team.name) == new_name.lower(), Team.id != team_id)
        ).scalar_one_or_none()
        if clash is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "team name already exists")
        team.name = new_name
    db.commit()
    count = db.execute(
        select(func.count(User.id)).where(User.team_id == team_id)
    ).scalar_one()
    return TeamOut(id=team.id, name=team.name, member_count=int(count))


@admin_router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def admin_delete_team(
    team_id: uuid.UUID,
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "team not found")
    # FK is ON DELETE SET NULL, so members become team-less.
    db.delete(team)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def ensure_team_exists(db: Session, team_id: uuid.UUID | None) -> None:
    if team_id is None:
        return
    t = db.get(Team, team_id)
    if t is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "unknown team_id")
