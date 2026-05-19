"""Batch ingest of 60-second activity buckets."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Set, Tuple

from fastapi import APIRouter, Depends, status
from sqlalchemy import and_, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import CurrentUser, SignedDevice
from ..models.activity import ActivityLog
from ..models.session import WorkSession
from ..schemas.activity import ActivityBatchRequest, ActivityBatchResponse
from ..services.anti_spoof import check_bucket

router = APIRouter(prefix="/activity", tags=["activity"])


@router.post("/batch", response_model=ActivityBatchResponse, status_code=status.HTTP_200_OK)
def ingest_batch(
    body: ActivityBatchRequest,
    current: CurrentUser,
    device: SignedDevice,
    db: Annotated[Session, Depends(get_db)],
) -> ActivityBatchResponse:
    user, device_id = current

    # Pre-load the caller's sessions referenced in the batch for ownership checks.
    session_ids = {b.session_id for b in body.buckets}
    owned = db.execute(
        select(WorkSession.id).where(
            and_(WorkSession.user_id == user.id, WorkSession.id.in_(session_ids))
        )
    ).scalars().all()
    owned_set: Set = set(owned)

    accepted = 0
    rejected = 0
    reasons: list[str] = []
    rows: list[dict[str, object]] = []

    for b in body.buckets:
        if b.session_id not in owned_set:
            rejected += 1
            reasons.append(f"{b.client_event_id}:session not owned")
            continue
        v = check_bucket(b)
        if not v.ok:
            rejected += 1
            reasons.append(f"{b.client_event_id}:{v.reason}")
            continue
        rows.append(
            dict(
                user_id=user.id,
                session_id=b.session_id,
                device_id=device_id,
                client_event_id=b.client_event_id,
                bucket_start=b.bucket_start,
                active_seconds=b.active_seconds,
                idle_seconds=b.idle_seconds,
                keystroke_count=b.keystroke_count,
                mouse_event_count=b.mouse_event_count,
            )
        )
        accepted += 1

    inserted = 0
    if rows:
        # Dedup on the (device_id, client_event_id) unique index so a
        # client re-sending a batch is idempotent. SQLite's UPSERT
        # targets the conflicting index by its columns.
        stmt = sqlite_insert(ActivityLog).values(rows)
        stmt = stmt.on_conflict_do_nothing(
            index_elements=["device_id", "client_event_id"]
        )
        result = db.execute(stmt)
        inserted = result.rowcount or 0

    device.last_seen_at = datetime.now(timezone.utc)
    db.commit()

    deduped = accepted - inserted
    return ActivityBatchResponse(
        accepted=inserted,
        deduplicated=deduped,
        rejected=rejected,
        reasons=reasons[:50],
    )
