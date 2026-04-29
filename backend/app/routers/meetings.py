"""Meetings — admin CRUD + per-user upcoming list."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import AdminUser, CurrentUser
from ..models.meeting import Meeting
from ..models.team import Team
from ..routers.teams import ensure_team_exists
from ..schemas.meeting import MeetingCreate, MeetingList, MeetingOut, MeetingUpdate

public_router = APIRouter(prefix="/me/meetings", tags=["meetings"])
admin_router = APIRouter(prefix="/admin/meetings", tags=["admin-meetings"])


def _team_name_map(db: Session) -> dict[uuid.UUID, str]:
    return {t.id: t.name for t in db.execute(select(Team)).scalars().all()}


def _to_out(m: Meeting, names: dict[uuid.UUID, str]) -> MeetingOut:
    return MeetingOut(
        id=m.id,
        title=m.title,
        meeting_link=m.meeting_link,
        scheduled_at=m.scheduled_at,
        duration_minutes=m.duration_minutes,
        team_id=m.team_id,
        team_name=names.get(m.team_id) if m.team_id else None,
        created_at=m.created_at,
    )


# ---- user-facing -----------------------------------------------------------


@public_router.get("", response_model=MeetingList)
def list_my_meetings(
    current: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> MeetingList:
    """Upcoming + recently-started meetings the user is invited to.
    Returns meetings whose end time is at most 1h in the past, going 30 days
    forward, that target either the user's team or all users."""
    user, _device_id = current
    now = datetime.now(timezone.utc)
    horizon_back = now - timedelta(hours=1)
    horizon_forward = now + timedelta(days=30)
    rows = db.execute(
        select(Meeting)
        .where(
            and_(
                Meeting.scheduled_at >= horizon_back,
                Meeting.scheduled_at <= horizon_forward,
                or_(Meeting.team_id.is_(None), Meeting.team_id == user.team_id),
            )
        )
        .order_by(Meeting.scheduled_at.asc())
    ).scalars().all()
    names = _team_name_map(db)
    return MeetingList(meetings=[_to_out(m, names) for m in rows])


# ---- admin -----------------------------------------------------------------


@admin_router.get("", response_model=MeetingList)
def admin_list_meetings(
    admin: AdminUser, db: Annotated[Session, Depends(get_db)]
) -> MeetingList:
    rows = db.execute(select(Meeting).order_by(Meeting.scheduled_at.desc())).scalars().all()
    names = _team_name_map(db)
    return MeetingList(meetings=[_to_out(m, names) for m in rows])


@admin_router.post("", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
def admin_create_meeting(
    body: MeetingCreate,
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> MeetingOut:
    ensure_team_exists(db, body.team_id)
    m = Meeting(
        title=body.title.strip(),
        meeting_link=(body.meeting_link or None),
        scheduled_at=body.scheduled_at,
        duration_minutes=body.duration_minutes,
        team_id=body.team_id,
        created_by=admin.id,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _to_out(m, _team_name_map(db))


@admin_router.patch("/{meeting_id}", response_model=MeetingOut)
def admin_update_meeting(
    meeting_id: uuid.UUID,
    body: MeetingUpdate,
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> MeetingOut:
    m = db.get(Meeting, meeting_id)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "meeting not found")
    if body.title is not None:
        m.title = body.title.strip()
    if body.meeting_link is not None:
        m.meeting_link = body.meeting_link or None
    if body.scheduled_at is not None:
        m.scheduled_at = body.scheduled_at
    if body.duration_minutes is not None:
        m.duration_minutes = body.duration_minutes
    if body.team_id is not None:
        ensure_team_exists(db, body.team_id)
        m.team_id = body.team_id
    db.commit()
    db.refresh(m)
    return _to_out(m, _team_name_map(db))


@admin_router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def admin_delete_meeting(
    meeting_id: uuid.UUID,
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    m = db.get(Meeting, meeting_id)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "meeting not found")
    db.delete(m)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
