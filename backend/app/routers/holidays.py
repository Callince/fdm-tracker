"""Holidays — admin-managed non-working days, also visible to all users."""
from __future__ import annotations

import uuid
from datetime import date as date_type
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import AdminUser, CurrentUser
from ..models.holiday import Holiday
from ..schemas.holiday import HolidayCreate, HolidayList, HolidayOut

public_router = APIRouter(prefix="/holidays", tags=["holidays"])
admin_router = APIRouter(prefix="/admin/holidays", tags=["admin-holidays"])


def _to_out(h: Holiday) -> HolidayOut:
    return HolidayOut(id=h.id, date=h.date, name=h.name, kind=h.kind)  # type: ignore[arg-type]


@public_router.get("", response_model=HolidayList)
def list_holidays(current: CurrentUser, db: Annotated[Session, Depends(get_db)]) -> HolidayList:
    """All-org holidays. Same list for every user."""
    rows = db.execute(select(Holiday).order_by(Holiday.date.asc())).scalars().all()
    return HolidayList(holidays=[_to_out(h) for h in rows])


@admin_router.get("", response_model=HolidayList)
def admin_list_holidays(admin: AdminUser, db: Annotated[Session, Depends(get_db)]) -> HolidayList:
    rows = db.execute(select(Holiday).order_by(Holiday.date.asc())).scalars().all()
    return HolidayList(holidays=[_to_out(h) for h in rows])


@admin_router.post("", response_model=HolidayOut, status_code=status.HTTP_201_CREATED)
def admin_create_holiday(
    body: HolidayCreate,
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> HolidayOut:
    existing = db.execute(select(Holiday).where(Holiday.date == body.date)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "holiday already set for that date")
    h = Holiday(date=body.date, name=body.name.strip(), kind=body.kind)
    db.add(h)
    db.commit()
    db.refresh(h)
    return _to_out(h)


@admin_router.delete("/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def admin_delete_holiday(
    holiday_id: uuid.UUID,
    admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    h = db.get(Holiday, holiday_id)
    if h is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "holiday not found")
    db.delete(h)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
