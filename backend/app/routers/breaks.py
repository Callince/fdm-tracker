"""Start/end a break.

Server-authoritative timestamps — same rationale as sessions.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import CurrentUser, SignedDevice
from ..models.break_log import BreakLog
from ..models.session import WorkSession
from ..schemas.break_log import (
    BreakEndRequest,
    BreakEndResponse,
    BreakStartRequest,
    BreakStartResponse,
)

router = APIRouter(prefix="/breaks", tags=["breaks"])


@router.post("/start", response_model=BreakStartResponse)
def start_break(
    body: BreakStartRequest,
    current: CurrentUser,
    device: SignedDevice,
    db: Annotated[Session, Depends(get_db)],
) -> BreakStartResponse:
    user, _ = current
    now_utc = datetime.now(timezone.utc)
    sess = db.get(WorkSession, body.session_id)
    if sess is None or sess.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
    if sess.ended_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "session already ended")

    # Reject overlapping open breaks for this session.
    existing = db.execute(
        select(BreakLog.id).where(
            and_(BreakLog.session_id == body.session_id, BreakLog.ended_at.is_(None))
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "break already open")

    br = BreakLog(
        user_id=user.id,
        session_id=body.session_id,
        started_at=now_utc,
        reason=body.reason,
    )
    db.add(br)
    device.last_seen_at = now_utc
    db.commit()
    db.refresh(br)
    return BreakStartResponse(break_id=br.id)


@router.post("/end", response_model=BreakEndResponse)
def end_break(
    body: BreakEndRequest,
    current: CurrentUser,
    device: SignedDevice,
    db: Annotated[Session, Depends(get_db)],
) -> BreakEndResponse:
    user, _ = current
    now_utc = datetime.now(timezone.utc)
    br = db.get(BreakLog, body.break_id)
    if br is None or br.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "break not found")
    if br.ended_at is not None:
        return BreakEndResponse(break_id=br.id, ended_at=br.ended_at)
    br.ended_at = now_utc
    device.last_seen_at = now_utc
    db.commit()
    return BreakEndResponse(break_id=br.id, ended_at=br.ended_at)
