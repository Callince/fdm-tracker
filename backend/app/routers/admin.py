"""Admin-only endpoints."""
from __future__ import annotations

import csv
import io
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ..database import get_db
from ..dependencies import AdminUser
from ..models.daily_summary import DailySummary
from ..models.device import Device
from ..models.settings import Settings as OrgSettings
from ..models.team import Team
from ..models.user import User
from ..routers.teams import ensure_team_exists
from ..schemas.admin import (
    AdminUserCreate,
    AdminUserDetail,
    AdminUserList,
    AdminUserUpdate,
    LiveSnapshot,
    ReportResponse,
    ReportRow,
    TeamOverview,
    TeamTrendResponse,
    TrendDay,
)
from ..schemas.settings import SettingsOut, SettingsUpdate
from ..schemas.summary import DailySummaryListResponse, DayDetailResponse
from ..security import hash_password
from ..services.audit import record as audit_record
from ..services.live_status import snapshot_all_users
from ..services.summary import compute_daily_summaries, compute_day_detail

router = APIRouter(prefix="/admin", tags=["admin"])


def _get_user(db: Session, user_id: uuid.UUID) -> User:
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    return u


def _detail(u: User, team_name: str | None = None) -> AdminUserDetail:
    return AdminUserDetail(
        id=u.id,
        name=u.name,
        email=u.email,
        role=u.role,  # type: ignore[arg-type]
        position=u.position,
        team_id=u.team_id,
        team_name=team_name,
        timezone=u.timezone,
        is_active=u.is_active,
    )


def _team_name_for(db: Session, team_id: uuid.UUID | None) -> str | None:
    if team_id is None:
        return None
    t = db.get(Team, team_id)
    return t.name if t else None


def _validate_timezone(tz: str) -> None:
    try:
        ZoneInfo(tz)
    except ZoneInfoNotFoundError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown timezone: {tz}") from e


def _revoke_user_tokens(db: Session, user: User) -> None:
    """Stamp password_changed_at + clear all device refresh JTIs for this user."""
    user.password_changed_at = datetime.now(timezone.utc)
    db.execute(
        Device.__table__.update()
        .where(Device.user_id == user.id)
        .values(refresh_token_jti=None)
    )


@router.get("/users", response_model=AdminUserList)
def list_users(
    admin: AdminUser, db: Annotated[Session, Depends(get_db)]
) -> AdminUserList:
    rows = snapshot_all_users(db)
    return AdminUserList(users=rows)


@router.post("/users", response_model=AdminUserDetail, status_code=status.HTTP_201_CREATED)
def create_user(
    body: AdminUserCreate,
    request: Request,
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> AdminUserDetail:
    email = body.email.lower()
    existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
    _validate_timezone(body.timezone)
    ensure_team_exists(db, body.team_id)
    u = User(
        name=body.name,
        email=email,
        password_hash=hash_password(body.password),
        role=body.role,
        position=body.position,
        team_id=body.team_id,
        timezone=body.timezone,
        is_active=True,
        email_verified_at=datetime.now(timezone.utc),  # admin vouches for them
    )
    db.add(u)
    db.flush()
    audit_record(
        db,
        actor_id=admin.id,
        action="user.create",
        target_type="user",
        target_id=u.id,
        diff={"after": {"email": u.email, "role": u.role, "team_id": str(u.team_id) if u.team_id else None}},
        request=request,
    )
    db.commit()
    db.refresh(u)
    return _detail(u, _team_name_for(db, u.team_id))


@router.get("/users/{user_id}", response_model=AdminUserDetail)
def get_user(
    user_id: uuid.UUID,
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> AdminUserDetail:
    u = _get_user(db, user_id)
    return _detail(u, _team_name_for(db, u.team_id))


@router.patch("/users/{user_id}", response_model=AdminUserDetail)
def update_user(
    user_id: uuid.UUID,
    body: AdminUserUpdate,
    request: Request,
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> AdminUserDetail:
    u = _get_user(db, user_id)
    before = {
        "name": u.name,
        "email": u.email,
        "role": u.role,
        "team_id": str(u.team_id) if u.team_id else None,
        "position": u.position,
        "timezone": u.timezone,
        "is_active": u.is_active,
    }

    if body.email is not None:
        new_email = body.email.lower()
        if new_email != u.email:
            clash = db.execute(select(User).where(User.email == new_email)).scalar_one_or_none()
            if clash is not None:
                raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
            u.email = new_email

    if body.name is not None:
        u.name = body.name
    if body.role is not None:
        # Refuse to demote the last remaining admin.
        if u.role == "admin" and body.role != "admin":
            remaining = db.execute(
                select(User).where(and_(User.role == "admin", User.is_active.is_(True), User.id != u.id))
            ).first()
            if remaining is None:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot demote the last admin")
        u.role = body.role
    if body.timezone is not None:
        _validate_timezone(body.timezone)
        u.timezone = body.timezone
    if body.position is not None:
        u.position = body.position or None
    if "team_id" in body.model_fields_set:
        ensure_team_exists(db, body.team_id)
        u.team_id = body.team_id
    if body.password is not None:
        u.password_hash = hash_password(body.password)
        _revoke_user_tokens(db, u)
    if body.is_active is not None:
        if u.role == "admin" and not body.is_active:
            remaining = db.execute(
                select(User).where(and_(User.role == "admin", User.is_active.is_(True), User.id != u.id))
            ).first()
            if remaining is None:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot disable the last admin")
        u.is_active = body.is_active
        if not body.is_active:
            _revoke_user_tokens(db, u)

    after = {
        "name": u.name,
        "email": u.email,
        "role": u.role,
        "team_id": str(u.team_id) if u.team_id else None,
        "position": u.position,
        "timezone": u.timezone,
        "is_active": u.is_active,
    }
    diff = {"before": before, "after": after, "password_changed": body.password is not None}
    audit_record(
        db,
        actor_id=admin.id,
        action="user.update",
        target_type="user",
        target_id=u.id,
        diff=diff,
        request=request,
    )

    db.commit()
    db.refresh(u)
    return _detail(u, _team_name_for(db, u.team_id))


@router.get("/activity/live", response_model=LiveSnapshot)
def live(admin: AdminUser, db: Annotated[Session, Depends(get_db)]) -> LiveSnapshot:
    return LiveSnapshot(generated_at=datetime.now(timezone.utc), users=snapshot_all_users(db))


@router.get("/users/{user_id}/daily-summary", response_model=DailySummaryListResponse)
def user_summary(
    user_id: uuid.UUID,
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> DailySummaryListResponse:
    u = _get_user(db, user_id)
    days = compute_daily_summaries(db, u, from_date, to_date)
    return DailySummaryListResponse(timezone=u.timezone, days=days)


@router.get("/users/{user_id}/day-details", response_model=DayDetailResponse)
def user_day(
    user_id: uuid.UUID,
    d: Annotated[date, Query(alias="date")],
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> DayDetailResponse:
    u = _get_user(db, user_id)
    return compute_day_detail(db, u, d)


@router.put("/settings", response_model=SettingsOut)
def update_settings(
    body: SettingsUpdate,
    request: Request,
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> SettingsOut:
    s = db.get(OrgSettings, 1)
    if s is None:
        s = OrgSettings(id=1)
        db.add(s)
    before = {
        "idle_threshold_minutes": s.idle_threshold_minutes,
        "workday_start_hour": s.workday_start_hour,
        "target_hours_per_day": s.target_hours_per_day,
    }
    s.idle_threshold_minutes = body.idle_threshold_minutes
    s.workday_start_hour = body.workday_start_hour
    s.target_hours_per_day = body.target_hours_per_day
    s.updated_by = admin.id
    after = {
        "idle_threshold_minutes": s.idle_threshold_minutes,
        "workday_start_hour": s.workday_start_hour,
        "target_hours_per_day": s.target_hours_per_day,
    }
    audit_record(
        db,
        actor_id=admin.id,
        action="settings.update",
        target_type="settings",
        diff={"before": before, "after": after},
        request=request,
    )
    db.commit()
    db.refresh(s)
    return SettingsOut(
        idle_threshold_minutes=s.idle_threshold_minutes,
        workday_start_hour=s.workday_start_hour,
        target_hours_per_day=s.target_hours_per_day,
    )


@router.get("/settings", response_model=SettingsOut)
def get_settings_row(
    admin: AdminUser, db: Annotated[Session, Depends(get_db)]
) -> SettingsOut:
    s = db.get(OrgSettings, 1) or OrgSettings(id=1)
    return SettingsOut(
        idle_threshold_minutes=s.idle_threshold_minutes,
        workday_start_hour=s.workday_start_hour,
        target_hours_per_day=s.target_hours_per_day,
    )


@router.get("/overview", response_model=TeamOverview)
def overview(admin: AdminUser, db: Annotated[Session, Depends(get_db)]) -> TeamOverview:
    snap = snapshot_all_users(db)
    return TeamOverview(
        total_users=len(snap),
        active_now=sum(1 for u in snap if u.status == "active"),
        on_break_now=sum(1 for u in snap if u.status == "on_break"),
        team_active_seconds_today=sum(u.today_active_seconds for u in snap),
        team_break_seconds_today=sum(u.today_break_seconds for u in snap),
        team_idle_seconds_today=sum(u.today_idle_seconds for u in snap),
    )


# ---------------------------------------------------------------------------
# Trend / report aggregation. The previous implementation looped over every
# active user and called compute_daily_summaries() per user — N+1 against
# both daily_summary and the live-aggregation paths. We now hit
# daily_summary in a single GROUP BY and only fall back to live aggregation
# for the (typically) rolling 7-day uncached window.
# ---------------------------------------------------------------------------


_LIVE_FALLBACK_DAYS = 7


def _summary_grid(
    db: Session,
    users: list[User],
    from_date: date,
    to_date: date,
) -> dict[tuple[uuid.UUID, date], tuple[int, int, int]]:
    """Returns {(user_id, date): (active, idle, break)} from daily_summary
    plus live aggregation for any (user, date) within the last 7 days
    that has no cached row. Doesn't compute anything for users not in
    `users`."""
    if not users:
        return {}
    user_ids = [u.id for u in users]

    cached_rows = db.execute(
        select(
            DailySummary.user_id,
            DailySummary.date,
            DailySummary.total_active_seconds,
            DailySummary.total_idle_seconds,
            DailySummary.total_break_seconds,
        ).where(
            and_(
                DailySummary.user_id.in_(user_ids),
                DailySummary.date >= from_date,
                DailySummary.date <= to_date,
            )
        )
    ).all()
    grid: dict[tuple[uuid.UUID, date], tuple[int, int, int]] = {}
    for uid, d, a, i, b in cached_rows:
        grid[(uid, d)] = (int(a), int(i), int(b))

    # Live fallback for the most recent N days that the rebuild may not
    # have covered yet (including today). Bounded loop — N <= 7.
    today = datetime.now(timezone.utc).date()
    live_lo = max(from_date, today - timedelta(days=_LIVE_FALLBACK_DAYS))
    live_hi = min(to_date, today)
    if live_lo <= live_hi:
        for u in users:
            cursor = live_lo
            while cursor <= live_hi:
                if (u.id, cursor) not in grid:
                    days = compute_daily_summaries(db, u, cursor, cursor)
                    if days:
                        d0 = days[0]
                        grid[(u.id, cursor)] = (
                            d0.total_active_seconds,
                            d0.total_idle_seconds,
                            d0.total_break_seconds,
                        )
                cursor += timedelta(days=1)
    return grid


@router.get("/team-trend", response_model=TeamTrendResponse)
def team_trend(
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> TeamTrendResponse:
    if to_date < from_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "to < from")
    if (to_date - from_date).days > 92:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "range too wide (max 92 days)")

    users = db.execute(select(User).where(User.is_active.is_(True))).scalars().all()
    grid = _summary_grid(db, list(users), from_date, to_date)

    by_date: dict[date, list[int]] = {}
    for (_uid, d), (a, i, b) in grid.items():
        bucket = by_date.setdefault(d, [0, 0, 0])
        bucket[0] += a
        bucket[1] += i
        bucket[2] += b

    days: list[TrendDay] = []
    cursor = from_date
    while cursor <= to_date:
        a, i, b = by_date.get(cursor, [0, 0, 0])
        days.append(
            TrendDay(
                date=cursor.isoformat(),
                active_hours=round(a / 3600, 2),
                idle_hours=round(i / 3600, 2),
                break_hours=round(b / 3600, 2),
            )
        )
        cursor += timedelta(days=1)

    return TeamTrendResponse(from_date=from_date.isoformat(), to_date=to_date.isoformat(), days=days)


@router.get(
    "/reports",
    responses={
        200: {
            "description": "report payload",
            "content": {"text/csv": {}, "application/json": {}},
        }
    },
)
def reports(
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
    fmt: Annotated[Literal["csv", "json"], Query(alias="format")],
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
    include_zero: Annotated[bool, Query()] = False,
    team_id: Annotated[uuid.UUID | None, Query()] = None,
    group_by: Annotated[Literal["user", "team"], Query()] = "user",
) -> Response:
    if to_date < from_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "to < from")
    if (to_date - from_date).days > 366:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "range too wide")

    q = select(User).where(User.is_active.is_(True))
    if team_id is not None:
        q = q.where(User.team_id == team_id)
    users = list(db.execute(q).scalars().all())

    team_names = {t.id: t.name for t in db.execute(select(Team)).scalars().all()}
    user_index = {u.id: u for u in users}
    grid = _summary_grid(db, users, from_date, to_date)
    rows: list[ReportRow] = []

    if group_by == "team":
        team_totals: dict[tuple[uuid.UUID | None, date], list[int]] = {}
        for (uid, d), (a, i, b) in grid.items():
            u = user_index.get(uid)
            if u is None:
                continue
            bucket = team_totals.setdefault((u.team_id, d), [0, 0, 0])
            bucket[0] += a
            bucket[1] += i
            bucket[2] += b
        for (tid, d), (a, i, b) in sorted(
            team_totals.items(), key=lambda kv: (kv[0][1], team_names.get(kv[0][0]) or "zz")
        ):
            if not include_zero and a + i + b == 0:
                continue
            rows.append(
                ReportRow(
                    user_id=tid or uuid.UUID(int=0),
                    name=team_names.get(tid) or "— No team —",
                    email="",
                    date=d.isoformat(),
                    active_hours=round(a / 3600, 2),
                    idle_hours=round(i / 3600, 2),
                    break_hours=round(b / 3600, 2),
                )
            )
    else:
        # Stable ordering: user name, then date.
        keys = sorted(
            grid.keys(),
            key=lambda k: ((user_index[k[0]].name if k[0] in user_index else ""), k[1]),
        )
        for uid, d in keys:
            u = user_index.get(uid)
            if u is None:
                continue
            a, i, b = grid[(uid, d)]
            if not include_zero and a + i + b == 0:
                continue
            rows.append(
                ReportRow(
                    user_id=u.id,
                    name=u.name,
                    email=u.email,
                    date=d.isoformat(),
                    active_hours=round(a / 3600, 2),
                    idle_hours=round(i / 3600, 2),
                    break_hours=round(b / 3600, 2),
                )
            )

    if fmt == "json":
        return Response(
            content=ReportResponse(
                from_date=from_date.isoformat(), to_date=to_date.isoformat(), rows=rows
            ).model_dump_json(),
            media_type="application/json",
        )

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["user_id", "name", "email", "date", "active_hours", "idle_hours", "break_hours"])
    for r in rows:
        w.writerow([r.user_id, r.name, r.email, r.date, r.active_hours, r.idle_hours, r.break_hours])
    filename = f"fdm-report-{from_date}-{to_date}.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
