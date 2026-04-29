"""Summary / calendar aggregation.

Work-day boundary rule: a "day" for user U is the local-time span
[workday_start_hour, workday_start_hour + 24) in U's timezone.
All aggregation converts UTC bucket_start → user-local, subtracts
workday_start_hour, floors to date.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Tuple

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo

from ..models.activity import ActivityLog
from ..models.break_log import BreakLog
from ..models.daily_summary import DailySummary
from ..models.session import WorkSession
from ..models.settings import Settings as OrgSettings
from ..models.user import User
from ..schemas.summary import ActivityBucketOut, DailySummaryOut, DayDetailResponse
from ..schemas.break_log import BreakOut
from ..schemas.session import SessionOut


def _org(db: Session) -> OrgSettings:
    s = db.get(OrgSettings, 1)
    if s is None:
        s = OrgSettings(id=1)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def _workday_date(ts_utc: datetime, tz: ZoneInfo, workday_start_hour: int) -> date:
    local = ts_utc.astimezone(tz) - timedelta(hours=workday_start_hour)
    return local.date()


def _day_window_utc(
    d: date, tz: ZoneInfo, workday_start_hour: int
) -> Tuple[datetime, datetime]:
    start_local = datetime(d.year, d.month, d.day, workday_start_hour, 0, 0, tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def compute_daily_summaries(
    db: Session, user: User, from_date: date, to_date: date
) -> List[DailySummaryOut]:
    """Reads from daily_summary when available; falls back to live aggregation
    for dates the nightly rebuild hasn't covered (including today)."""
    org = _org(db)
    tz = ZoneInfo(user.timezone)

    rows = db.execute(
        select(DailySummary)
        .where(
            and_(
                DailySummary.user_id == user.id,
                DailySummary.date >= from_date,
                DailySummary.date <= to_date,
            )
        )
        .order_by(DailySummary.date.asc())
    ).scalars().all()
    cached = {r.date: r for r in rows}

    out: List[DailySummaryOut] = []
    cursor = from_date
    while cursor <= to_date:
        if cursor in cached:
            r = cached[cursor]
            out.append(
                DailySummaryOut(
                    date=r.date,
                    total_active_seconds=r.total_active_seconds,
                    total_idle_seconds=r.total_idle_seconds,
                    total_break_seconds=r.total_break_seconds,
                    first_activity_at=r.first_activity_at,
                    last_activity_at=r.last_activity_at,
                )
            )
        else:
            out.append(_live_day_summary(db, user, cursor, tz, org.workday_start_hour))
        cursor += timedelta(days=1)
    return out


def _live_day_summary(
    db: Session, user: User, d: date, tz: ZoneInfo, workday_start_hour: int
) -> DailySummaryOut:
    start_utc, end_utc = _day_window_utc(d, tz, workday_start_hour)

    break_rows = db.execute(
        select(BreakLog.started_at, BreakLog.ended_at).where(
            and_(
                BreakLog.user_id == user.id,
                BreakLog.started_at >= start_utc,
                BreakLog.started_at < end_utc,
            )
        )
    ).all()
    breaks: list[tuple[datetime, datetime]] = [
        (st, en) for st, en in break_rows if en is not None
    ]
    break_s = sum(int((en - st).total_seconds()) for st, en in breaks)

    # Fast path: no breaks, just sum the buckets directly.
    if not breaks:
        act = db.execute(
            select(
                func.coalesce(func.sum(ActivityLog.active_seconds), 0),
                func.coalesce(func.sum(ActivityLog.idle_seconds), 0),
                func.min(ActivityLog.bucket_start),
                func.max(ActivityLog.bucket_start),
            ).where(
                and_(
                    ActivityLog.user_id == user.id,
                    ActivityLog.bucket_start >= start_utc,
                    ActivityLog.bucket_start < end_utc,
                )
            )
        ).one()
        active_s, idle_s, first_at, last_at = act
        return DailySummaryOut(
            date=d,
            total_active_seconds=int(active_s),
            total_idle_seconds=int(idle_s),
            total_break_seconds=0,
            first_activity_at=first_at,
            last_activity_at=last_at,
        )

    # Slow path: fetch individual buckets and subtract break overlap.
    bucket_rows = db.execute(
        select(
            ActivityLog.bucket_start,
            ActivityLog.active_seconds,
            ActivityLog.idle_seconds,
        ).where(
            and_(
                ActivityLog.user_id == user.id,
                ActivityLog.bucket_start >= start_utc,
                ActivityLog.bucket_start < end_utc,
            )
        ).order_by(ActivityLog.bucket_start.asc())
    ).all()

    active_total = 0
    idle_total = 0
    first_at: datetime | None = None
    last_at: datetime | None = None
    bucket_seconds = 60

    for bs, b_active, b_idle in bucket_rows:
        if first_at is None or bs < first_at:
            first_at = bs
        if last_at is None or bs > last_at:
            last_at = bs

        be = bs + timedelta(seconds=bucket_seconds)
        # Total seconds of this bucket that fall inside any break.
        overlap = 0
        for brk_st, brk_en in breaks:
            if brk_en <= bs or brk_st >= be:
                continue
            o_start = max(bs, brk_st)
            o_end = min(be, brk_en)
            overlap += int((o_end - o_start).total_seconds())
        if overlap <= 0:
            active_total += int(b_active)
            idle_total += int(b_idle)
            continue

        base_total = int(b_active) + int(b_idle)
        if base_total <= 0:
            continue
        # Cap overlap at how much active+idle we actually have on file.
        overlap = min(overlap, base_total)
        # Subtract proportionally so the active/idle ratio is preserved.
        active_remove = round(overlap * (int(b_active) / base_total))
        idle_remove = overlap - active_remove
        active_total += int(b_active) - active_remove
        idle_total += int(b_idle) - idle_remove

    return DailySummaryOut(
        date=d,
        total_active_seconds=active_total,
        total_idle_seconds=idle_total,
        total_break_seconds=break_s,
        first_activity_at=first_at,
        last_activity_at=last_at,
    )


def compute_day_detail(db: Session, user: User, d: date) -> DayDetailResponse:
    org = _org(db)
    tz = ZoneInfo(user.timezone)
    start_utc, end_utc = _day_window_utc(d, tz, org.workday_start_hour)

    sessions = db.execute(
        select(WorkSession)
        .where(
            and_(
                WorkSession.user_id == user.id,
                WorkSession.started_at >= start_utc,
                WorkSession.started_at < end_utc,
            )
        )
        .order_by(WorkSession.started_at.asc())
    ).scalars().all()

    breaks = db.execute(
        select(BreakLog)
        .where(
            and_(
                BreakLog.user_id == user.id,
                BreakLog.started_at >= start_utc,
                BreakLog.started_at < end_utc,
            )
        )
        .order_by(BreakLog.started_at.asc())
    ).scalars().all()

    buckets = db.execute(
        select(ActivityLog)
        .where(
            and_(
                ActivityLog.user_id == user.id,
                ActivityLog.bucket_start >= start_utc,
                ActivityLog.bucket_start < end_utc,
            )
        )
        .order_by(ActivityLog.bucket_start.asc())
    ).scalars().all()

    totals = _live_day_summary(db, user, d, tz, org.workday_start_hour)

    return DayDetailResponse(
        user_id=user.id,
        date=d,
        timezone=user.timezone,
        sessions=[SessionOut(id=s.id, started_at=s.started_at, ended_at=s.ended_at) for s in sessions],
        breaks=[
            BreakOut(
                id=b.id,
                session_id=b.session_id,
                started_at=b.started_at,
                ended_at=b.ended_at,
                reason=b.reason,
            )
            for b in breaks
        ],
        buckets=[
            ActivityBucketOut(
                bucket_start=b.bucket_start,
                active_seconds=b.active_seconds,
                idle_seconds=b.idle_seconds,
                keystroke_count=b.keystroke_count,
                mouse_event_count=b.mouse_event_count,
            )
            for b in buckets
        ],
        totals=totals,
    )


def rebuild_daily_summary(db: Session, user: User, d: date) -> DailySummary:
    """Upsert one (user, date) row in daily_summary."""
    org = _org(db)
    tz = ZoneInfo(user.timezone)
    live = _live_day_summary(db, user, d, tz, org.workday_start_hour)

    existing = db.execute(
        select(DailySummary).where(
            and_(DailySummary.user_id == user.id, DailySummary.date == d)
        )
    ).scalar_one_or_none()

    if existing is None:
        existing = DailySummary(user_id=user.id, date=d)
        db.add(existing)

    existing.total_active_seconds = live.total_active_seconds
    existing.total_idle_seconds = live.total_idle_seconds
    existing.total_break_seconds = live.total_break_seconds
    existing.first_activity_at = live.first_activity_at
    existing.last_activity_at = live.last_activity_at
    db.flush()
    return existing
