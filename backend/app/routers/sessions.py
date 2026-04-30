"""Start/end a work session.

Timestamps are server-authoritative: we ignore client-supplied `started_at`
/ `ended_at` to prevent backdating. Activity buckets (which carry their
own bucket_start) still allow up-to-14-day backfill via the anti-spoof
rules; that's the right surface for offline-replay correctness.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import CurrentUser, SignedDevice
from ..models.break_log import BreakLog
from ..models.session import WorkSession
from ..schemas.session import (
    SessionEndRequest,
    SessionEndResponse,
    SessionStartRequest,
    SessionStartResponse,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("/start", response_model=SessionStartResponse)
def start_session(
    body: SessionStartRequest,
    request: Request,
    current: CurrentUser,
    device: SignedDevice,
    db: Annotated[Session, Depends(get_db)],
) -> SessionStartResponse:
    user, device_id = current
    now_utc = datetime.now(timezone.utc)

    # Close any previously-open session on this device (crash recovery) AND
    # any break that was still open under it — a break can never outlive its
    # session.
    dangling = db.execute(
        select(WorkSession).where(
            and_(
                WorkSession.user_id == user.id,
                WorkSession.device_id == device_id,
                WorkSession.ended_at.is_(None),
            )
        )
    ).scalars().all()
    for s in dangling:
        s.ended_at = now_utc
        _close_open_breaks_for_session(db, s.id, now_utc)

    # Defensive: also close any break orphaned across the user.
    _close_orphaned_breaks(db, user.id, now_utc)

    new_session = WorkSession(
        user_id=user.id,
        device_id=device_id,
        started_at=now_utc,
        client_ip=_client_ip(request),
    )
    db.add(new_session)
    device.last_seen_at = now_utc
    db.commit()
    db.refresh(new_session)
    return SessionStartResponse(session_id=new_session.id, started_at=new_session.started_at)


@router.post("/end", response_model=SessionEndResponse)
def end_session(
    body: SessionEndRequest,
    current: CurrentUser,
    device: SignedDevice,
    db: Annotated[Session, Depends(get_db)],
) -> SessionEndResponse:
    user, device_id = current
    now_utc = datetime.now(timezone.utc)
    session = db.get(WorkSession, body.session_id)
    if session is None or session.user_id != user.id or session.device_id != device_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
    if session.ended_at is not None:
        return SessionEndResponse(session_id=session.id, ended_at=session.ended_at)
    session.ended_at = now_utc
    _close_open_breaks_for_session(db, session.id, now_utc)
    _close_orphaned_breaks(db, user.id, now_utc)
    device.last_seen_at = now_utc
    db.commit()
    return SessionEndResponse(session_id=session.id, ended_at=session.ended_at)


def _close_open_breaks_for_session(db: Session, session_id, when: datetime) -> None:
    open_breaks = db.execute(
        select(BreakLog).where(
            and_(BreakLog.session_id == session_id, BreakLog.ended_at.is_(None))
        )
    ).scalars().all()
    for b in open_breaks:
        b.ended_at = when


def _close_orphaned_breaks(db: Session, user_id, when: datetime) -> None:
    """Close any break whose parent session has ended but which never got
    its own ended_at set — happens when a client crashes mid-break."""
    rows = db.execute(
        select(BreakLog, WorkSession)
        .join(WorkSession, WorkSession.id == BreakLog.session_id)
        .where(
            and_(
                BreakLog.user_id == user_id,
                BreakLog.ended_at.is_(None),
                WorkSession.ended_at.is_not(None),
            )
        )
    ).all()
    for b, s in rows:
        b.ended_at = s.ended_at if s.ended_at is not None else when
