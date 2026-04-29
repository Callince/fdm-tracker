"""Meetings — admin CRUD + per-user upcoming list.

Audience model: a meeting either has explicit attendees (only those users see
it) or no attendees (broadcast — every user sees it).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import AdminUser, CurrentUser
from ..models.meeting import Meeting, meeting_attendees
from ..models.user import User
from ..schemas.meeting import (
    AttendeeBrief,
    MeetingCreate,
    MeetingList,
    MeetingOut,
    MeetingUpdate,
)

public_router = APIRouter(prefix="/me/meetings", tags=["meetings"])
admin_router = APIRouter(prefix="/admin/meetings", tags=["admin-meetings"])


def _to_out(m: Meeting) -> MeetingOut:
    return MeetingOut(
        id=m.id,
        title=m.title,
        meeting_link=m.meeting_link,
        scheduled_at=m.scheduled_at,
        duration_minutes=m.duration_minutes,
        attendees=[AttendeeBrief(id=u.id, name=u.name, email=u.email) for u in m.attendees],
        created_at=m.created_at,
    )


def _resolve_attendees(db: Session, user_ids: list[uuid.UUID]) -> list[User]:
    if not user_ids:
        return []
    rows = db.execute(select(User).where(User.id.in_(user_ids))).scalars().all()
    found = {u.id for u in rows}
    missing = [str(uid) for uid in user_ids if uid not in found]
    if missing:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"unknown user_ids: {', '.join(missing)}"
        )
    return list(rows)


# ---- user-facing -----------------------------------------------------------


@public_router.get("", response_model=MeetingList)
def list_my_meetings(
    current: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> MeetingList:
    """Upcoming + recently-started meetings the user is invited to.

    Returns broadcast meetings (no attendees) and meetings the user is in.
    Window: 1h in the past to 30 days forward.
    """
    user, _device_id = current
    now = datetime.now(timezone.utc)
    horizon_back = now - timedelta(hours=1)
    horizon_forward = now + timedelta(days=30)

    # Direct invites + broadcasts (meetings with no rows in meeting_attendees).
    invited_ids = select(meeting_attendees.c.meeting_id).where(
        meeting_attendees.c.user_id == user.id
    )
    has_any_attendees = select(meeting_attendees.c.meeting_id)

    rows = db.execute(
        select(Meeting)
        .where(
            and_(
                Meeting.scheduled_at >= horizon_back,
                Meeting.scheduled_at <= horizon_forward,
            )
        )
        .where(
            (Meeting.id.in_(invited_ids))
            | (Meeting.id.notin_(has_any_attendees))
        )
        .order_by(Meeting.scheduled_at.asc())
    ).scalars().all()
    return MeetingList(meetings=[_to_out(m) for m in rows])


# ---- admin -----------------------------------------------------------------


@admin_router.get("", response_model=MeetingList)
def admin_list_meetings(
    admin: AdminUser, db: Annotated[Session, Depends(get_db)]
) -> MeetingList:
    rows = db.execute(select(Meeting).order_by(Meeting.scheduled_at.desc())).scalars().all()
    return MeetingList(meetings=[_to_out(m) for m in rows])


@admin_router.post("", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
def admin_create_meeting(
    body: MeetingCreate,
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> MeetingOut:
    attendees = _resolve_attendees(db, body.user_ids)
    m = Meeting(
        title=body.title.strip(),
        meeting_link=(body.meeting_link or None),
        scheduled_at=body.scheduled_at,
        duration_minutes=body.duration_minutes,
        created_by=admin.id,
    )
    m.attendees = attendees
    db.add(m)
    db.commit()
    db.refresh(m)
    return _to_out(m)


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
    if body.user_ids is not None:
        m.attendees = _resolve_attendees(db, body.user_ids)
    db.commit()
    db.refresh(m)
    return _to_out(m)


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
