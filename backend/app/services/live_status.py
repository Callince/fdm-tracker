"""Compute live per-user status for the admin dashboard."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List

from sqlalchemy import and_, desc, select
from sqlalchemy.orm import Session

from ..models.activity import ActivityLog
from ..models.break_log import BreakLog
from ..models.device import Device
from ..models.session import WorkSession
from ..models.settings import Settings as OrgSettings
from ..models.team import Team
from ..models.user import User
from ..schemas.admin import AdminUserRow
from .summary import _day_window_utc, _live_day_summary, _workday_date
from zoneinfo import ZoneInfo

# If we've heard nothing from a device for this long, call them offline.
OFFLINE_AFTER = timedelta(minutes=3)


def _current_status(
    db: Session, user: User, org: OrgSettings
) -> tuple[str, datetime | None]:
    """Returns (status, last_seen_at)."""
    last_device_seen = db.execute(
        select(Device.last_seen_at)
        .where(Device.user_id == user.id)
        .order_by(desc(Device.last_seen_at))
        .limit(1)
    ).scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if last_device_seen is None or (now - last_device_seen) > OFFLINE_AFTER:
        return "offline", last_device_seen

    open_session = db.execute(
        select(WorkSession.id).where(
            and_(WorkSession.user_id == user.id, WorkSession.ended_at.is_(None))
        ).order_by(desc(WorkSession.started_at)).limit(1)
    ).scalar_one_or_none()
    if open_session is None:
        return "offline", last_device_seen

    # A break is only "live" when its parent session is still open. Stale rows
    # with ended_at=null but a closed session must not flip status to on_break.
    open_break = db.execute(
        select(BreakLog.id)
        .join(WorkSession, WorkSession.id == BreakLog.session_id)
        .where(
            and_(
                BreakLog.user_id == user.id,
                BreakLog.ended_at.is_(None),
                WorkSession.ended_at.is_(None),
            )
        )
        .limit(1)
    ).scalar_one_or_none()
    if open_break is not None:
        return "on_break", last_device_seen

    latest_bucket = db.execute(
        select(ActivityLog)
        .where(ActivityLog.user_id == user.id)
        .order_by(desc(ActivityLog.bucket_start))
        .limit(1)
    ).scalar_one_or_none()
    if latest_bucket is None:
        return "idle", last_device_seen
    if latest_bucket.active_seconds >= 30:
        return "active", last_device_seen
    return "idle", last_device_seen


def snapshot_all_users(db: Session) -> List[AdminUserRow]:
    org = db.get(OrgSettings, 1) or OrgSettings(id=1)
    users = db.execute(select(User).where(User.is_active.is_(True))).scalars().all()
    team_names: dict = {t.id: t.name for t in db.execute(select(Team)).scalars().all()}
    rows: List[AdminUserRow] = []
    for u in users:
        status, last_seen = _current_status(db, u, org)
        tz = ZoneInfo(u.timezone)
        today = _workday_date(datetime.now(timezone.utc), tz, org.workday_start_hour)
        totals = _live_day_summary(db, u, today, tz, org.workday_start_hour)
        start_utc, end_utc = _day_window_utc(today, tz, org.workday_start_hour)
        today_started_at = db.execute(
            select(WorkSession.started_at)
            .where(
                and_(
                    WorkSession.user_id == u.id,
                    WorkSession.started_at >= start_utc,
                    WorkSession.started_at < end_utc,
                )
            )
            .order_by(WorkSession.started_at.asc())
            .limit(1)
        ).scalar_one_or_none()
        rows.append(
            AdminUserRow(
                id=u.id,
                name=u.name,
                email=u.email,
                role=u.role,  # type: ignore[arg-type]
                position=u.position,
                team_id=u.team_id,
                team_name=team_names.get(u.team_id) if u.team_id else None,
                timezone=u.timezone,
                is_active=u.is_active,
                status=status,  # type: ignore[arg-type]
                today_active_seconds=totals.total_active_seconds,
                today_idle_seconds=totals.total_idle_seconds,
                today_break_seconds=totals.total_break_seconds,
                today_started_at=today_started_at,
                last_seen_at=last_seen,
            )
        )
    return rows
