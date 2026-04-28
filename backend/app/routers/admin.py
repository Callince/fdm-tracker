"""Admin-only endpoints."""
from __future__ import annotations

import csv
import io
import uuid
from datetime import date, datetime, timedelta, timezone  # noqa: F401 -- datetime used below
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ..database import get_db
from ..dependencies import AdminUser
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
from ..security import hash_password
from ..schemas.summary import DailySummaryListResponse, DayDetailResponse
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


@router.get("/users", response_model=AdminUserList)
def list_users(
    admin: AdminUser, db: Annotated[Session, Depends(get_db)]
) -> AdminUserList:
    rows = snapshot_all_users(db)
    return AdminUserList(users=rows)


@router.post("/users", response_model=AdminUserDetail, status_code=status.HTTP_201_CREATED)
def create_user(
    body: AdminUserCreate,
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
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> AdminUserDetail:
    u = _get_user(db, user_id)

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
    if body.is_active is not None:
        if u.role == "admin" and not body.is_active:
            remaining = db.execute(
                select(User).where(and_(User.role == "admin", User.is_active.is_(True), User.id != u.id))
            ).first()
            if remaining is None:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot disable the last admin")
        u.is_active = body.is_active

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
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> SettingsOut:
    s = db.get(OrgSettings, 1)
    if s is None:
        s = OrgSettings(id=1)
        db.add(s)
    s.idle_threshold_minutes = body.idle_threshold_minutes
    s.workday_start_hour = body.workday_start_hour
    s.target_hours_per_day = body.target_hours_per_day
    s.updated_by = admin.id
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
    totals: dict[str, dict[str, int]] = {}
    for u in users:
        for d in compute_daily_summaries(db, u, from_date, to_date):
            key = d.date.isoformat()
            bucket = totals.setdefault(key, {"a": 0, "i": 0, "b": 0})
            bucket["a"] += d.total_active_seconds
            bucket["i"] += d.total_idle_seconds
            bucket["b"] += d.total_break_seconds

    days: list[TrendDay] = []
    cursor = from_date
    while cursor <= to_date:
        iso = cursor.isoformat()
        t = totals.get(iso, {"a": 0, "i": 0, "b": 0})
        days.append(
            TrendDay(
                date=iso,
                active_hours=round(t["a"] / 3600, 2),
                idle_hours=round(t["i"] / 3600, 2),
                break_hours=round(t["b"] / 3600, 2),
            )
        )
        cursor += timedelta(days=1)

    return TeamTrendResponse(from_date=from_date.isoformat(), to_date=to_date.isoformat(), days=days)


@router.get("/reports")
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
    users = db.execute(q).scalars().all()

    team_names = {t.id: t.name for t in db.execute(select(Team)).scalars().all()}
    rows: list[ReportRow] = []

    if group_by == "team":
        # One row per (team, date) — totals across all members in that team.
        totals: dict[tuple[uuid.UUID | None, str], dict[str, int]] = {}
        for u in users:
            for d in compute_daily_summaries(db, u, from_date, to_date):
                key = (u.team_id, d.date.isoformat())
                bucket = totals.setdefault(key, {"a": 0, "i": 0, "b": 0})
                bucket["a"] += d.total_active_seconds
                bucket["i"] += d.total_idle_seconds
                bucket["b"] += d.total_break_seconds
        for (tid, iso), t in sorted(totals.items(), key=lambda kv: (kv[0][1], team_names.get(kv[0][0]) or "zz")):
            if not include_zero and t["a"] + t["i"] + t["b"] == 0:
                continue
            rows.append(
                ReportRow(
                    user_id=tid or uuid.UUID(int=0),
                    name=team_names.get(tid) or "— No team —",
                    email="",
                    date=iso,
                    active_hours=round(t["a"] / 3600, 2),
                    idle_hours=round(t["i"] / 3600, 2),
                    break_hours=round(t["b"] / 3600, 2),
                )
            )
    else:
        for u in users:
            for d in compute_daily_summaries(db, u, from_date, to_date):
                total = d.total_active_seconds + d.total_idle_seconds + d.total_break_seconds
                if not include_zero and total == 0:
                    continue
                rows.append(
                    ReportRow(
                        user_id=u.id,
                        name=u.name,
                        email=u.email,
                        date=d.date.isoformat(),
                        active_hours=round(d.total_active_seconds / 3600, 2),
                        idle_hours=round(d.total_idle_seconds / 3600, 2),
                        break_hours=round(d.total_break_seconds / 3600, 2),
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
