"""Holiday schemas."""
from __future__ import annotations

import uuid
from datetime import date as date_type
from typing import List, Literal

from pydantic import BaseModel, Field

HolidayKind = Literal["holiday", "working"]


class HolidayCreate(BaseModel):
    date: date_type
    name: str = Field(min_length=1, max_length=128)
    kind: HolidayKind = "holiday"


class HolidayOut(BaseModel):
    id: uuid.UUID
    date: date_type
    name: str
    kind: HolidayKind


class HolidayList(BaseModel):
    holidays: List[HolidayOut]
