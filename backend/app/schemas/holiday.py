"""Holiday schemas."""
from __future__ import annotations

import uuid
from datetime import date as date_type
from typing import List

from pydantic import BaseModel, Field


class HolidayCreate(BaseModel):
    date: date_type
    name: str = Field(min_length=1, max_length=128)


class HolidayOut(BaseModel):
    id: uuid.UUID
    date: date_type
    name: str


class HolidayList(BaseModel):
    holidays: List[HolidayOut]
