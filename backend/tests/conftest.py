"""Shared test fixtures."""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg2://fdm:fdm@localhost:5432/fdm_test")
os.environ.setdefault("JWT_SECRET", "x" * 64)


@pytest.fixture(autouse=True)
def _anyio_backend() -> str:
    return "asyncio"
