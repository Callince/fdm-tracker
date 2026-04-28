"""Org-settings schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class SettingsOut(BaseModel):
    idle_threshold_minutes: int
    workday_start_hour: int
    target_hours_per_day: int


class SettingsUpdate(BaseModel):
    idle_threshold_minutes: int = Field(ge=1, le=120)
    workday_start_hour: int = Field(ge=0, le=23)
    target_hours_per_day: int = Field(ge=1, le=24)
