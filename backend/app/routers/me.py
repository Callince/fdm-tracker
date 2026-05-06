"""User's own profile, calendar + day-detail, password change, export."""
from __future__ import annotations

import csv
import io
import uuid
from datetime import date, datetime, timezone
from typing import Annotated, Literal, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import CurrentUser
from ..models.device import Device
from ..models.holiday import Holiday
from ..models.settings import Settings as OrgSettings
from ..models.team import Team
from ..routers.teams import ensure_team_exists
from ..schemas.summary import DailySummaryListResponse, DayDetailResponse
from ..security import hash_password, verify_password
from ..services.audit import record as audit_record
from ..services.summary import compute_daily_summaries, compute_day_detail

router = APIRouter(prefix="/me", tags=["me"])


class MeProfile(BaseModel):
    user_id: str
    name: str
    email: str
    role: Literal["user", "admin"]
    position: Optional[str]
    team_id: Optional[uuid.UUID]
    team_name: Optional[str]
    timezone: str
    # Org-level settings: must be returned here too (not just on /auth/login)
    # so the desktop client picks up admin changes without forcing re-login.
    idle_threshold_minutes: int
    target_hours_per_day: int


class MeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    position: Optional[str] = Field(default=None, max_length=128)
    team_id: Optional[uuid.UUID] = None
    timezone: Optional[str] = Field(default=None, max_length=64)


class MePasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


def _profile(user, team_name: str | None = None, settings: OrgSettings | None = None) -> MeProfile:  # type: ignore[no-untyped-def]
    return MeProfile(
        user_id=str(user.id),
        name=user.name,
        email=user.email,
        role=user.role,
        position=user.position,
        team_id=user.team_id,
        team_name=team_name,
        timezone=user.timezone,
        idle_threshold_minutes=settings.idle_threshold_minutes if settings else 5,
        target_hours_per_day=settings.target_hours_per_day if settings else 8,
    )


def _load_settings(db: Session) -> OrgSettings | None:
    return db.execute(select(OrgSettings).limit(1)).scalar_one_or_none()


def _team_name(db: Session, team_id: uuid.UUID | None) -> str | None:
    if team_id is None:
        return None
    t = db.get(Team, team_id)
    return t.name if t else None


@router.get("", response_model=MeProfile)
def me_profile(
    current: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> MeProfile:
    user, _ = current
    return _profile(user, _team_name(db, user.team_id), _load_settings(db))


@router.patch("", response_model=MeProfile)
def me_update(
    body: MeUpdate,
    current: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> MeProfile:
    user, _ = current
    if body.name is not None:
        user.name = body.name
    if body.position is not None:
        user.position = body.position or None
    if body.timezone is not None:
        try:
            ZoneInfo(body.timezone)
        except ZoneInfoNotFoundError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown timezone: {body.timezone}") from e
        user.timezone = body.timezone
    if "team_id" in body.model_fields_set:
        ensure_team_exists(db, body.team_id)
        user.team_id = body.team_id
    db.commit()
    db.refresh(user)
    return _profile(user, _team_name(db, user.team_id), _load_settings(db))


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def me_change_password(
    body: MePasswordChange,
    request: Request,
    current: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    user, current_device_id = current
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    user.password_changed_at = datetime.now(timezone.utc)
    # Kill outstanding refresh tokens on every device (the `password_changed_at`
    # check in dependencies.get_current_user already invalidates access tokens).
    db.execute(
        Device.__table__.update()
        .where(Device.user_id == user.id)
        .values(refresh_token_jti=None)
    )
    audit_record(
        db,
        actor_id=user.id,
        action="password.change",
        target_type="user",
        target_id=user.id,
        request=request,
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _validate_range(from_date: date, to_date: date) -> None:
    if to_date < from_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "to < from")
    if (to_date - from_date).days > 186:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "range too wide (max 186 days)")


@router.get("/daily-summary", response_model=DailySummaryListResponse)
def my_daily_summary(
    current: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
) -> DailySummaryListResponse:
    user, _ = current
    _validate_range(from_date, to_date)
    days = compute_daily_summaries(db, user, from_date, to_date)
    return DailySummaryListResponse(timezone=user.timezone, days=days)


@router.get("/day-details", response_model=DayDetailResponse)
def my_day_detail(
    current: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    d: Annotated[date, Query(alias="date")],
) -> DayDetailResponse:
    user, _ = current
    return compute_day_detail(db, user, d)


class RangeTotals(BaseModel):
    from_date: str
    to_date: str
    total_active_seconds: int
    total_idle_seconds: int
    total_break_seconds: int
    days_counted: int
    working_days: int
    holiday_count: int
    target_hours_per_day: int


@router.get("/range-totals", response_model=RangeTotals)
def me_range_totals(
    current: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
) -> RangeTotals:
    """Total active/idle/break seconds between from..to inclusive.

    `working_days` is Mon–Fri days in the range, minus admin holidays falling
    on weekdays, plus admin 'working' exceptions falling on weekends.
    """
    user, _ = current
    _validate_range(from_date, to_date)
    days = compute_daily_summaries(db, user, from_date, to_date)
    total_a = sum(d.total_active_seconds for d in days)
    total_i = sum(d.total_idle_seconds for d in days)
    total_b = sum(d.total_break_seconds for d in days)
    org = db.get(OrgSettings, 1) or OrgSettings(id=1)

    cal_rows = db.execute(
        select(Holiday.date, Holiday.kind).where(
            and_(Holiday.date >= from_date, Holiday.date <= to_date)
        )
    ).all()
    off_dates = {d for d, k in cal_rows if k == "holiday"}
    working_exception_dates = {d for d, k in cal_rows if k == "working"}
    working_days = 0
    cursor = from_date
    while cursor <= to_date:
        is_weekday = cursor.weekday() < 5
        if (is_weekday and cursor not in off_dates) or (
            not is_weekday and cursor in working_exception_dates
        ):
            working_days += 1
        cursor = cursor.fromordinal(cursor.toordinal() + 1)

    return RangeTotals(
        from_date=from_date.isoformat(),
        to_date=to_date.isoformat(),
        total_active_seconds=total_a,
        total_idle_seconds=total_i,
        total_break_seconds=total_b,
        days_counted=len(days),
        working_days=working_days,
        holiday_count=len(off_dates),
        target_hours_per_day=org.target_hours_per_day,
    )


@router.get(
    "/export",
    responses={200: {"description": "CSV", "content": {"text/csv": {}}}},
)
def me_export(
    current: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
) -> Response:
    """CSV of the authenticated user's own daily activity, DPDP self-serve."""
    user, _ = current
    _validate_range(from_date, to_date)
    days = compute_daily_summaries(db, user, from_date, to_date)

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["date", "active_hours", "idle_hours", "break_hours", "first_activity_at", "last_activity_at"])
    for d in days:
        w.writerow([
            d.date.isoformat(),
            round(d.total_active_seconds / 3600, 2),
            round(d.total_idle_seconds / 3600, 2),
            round(d.total_break_seconds / 3600, 2),
            d.first_activity_at.isoformat() if d.first_activity_at else "",
            d.last_activity_at.isoformat() if d.last_activity_at else "",
        ])
    filename = f"fdm-my-activity-{from_date}-{to_date}.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
