"""Shared test fixtures.

DB-backed fixtures (`client`, `signing_helpers`) are opt-in: tests that
declare them get a freshly-recreated schema and a per-test table reset.
Pure-unit tests (e.g. test_smoke) don't pull in any DB.
"""
from __future__ import annotations

import os
import secrets
import tempfile
from pathlib import Path
from typing import Iterator

import pytest

# These must be set BEFORE the app is imported. SQLite is the only DB;
# tests run against a throwaway file so they never touch a real DB.
_TEST_DB = Path(tempfile.gettempdir()) / "fdm_test.db"
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TEST_DB.as_posix()}")
os.environ.setdefault("JWT_SECRET", secrets.token_urlsafe(48))
os.environ.setdefault("ENV", "test")
os.environ.setdefault("EMAIL_BACKEND", "console")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("ALLOWED_SIGNUP_DOMAINS", "fourdm.com,test.local")


@pytest.fixture(scope="session")
def _db_setup() -> Iterator[None]:
    from sqlalchemy.exc import OperationalError

    from app.database import Base, engine
    from app import models  # noqa: F401  -- register models on metadata

    try:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
    except OperationalError as e:
        pytest.skip(
            f"Test DB unusable ({e.orig.args[0] if e.orig.args else e}). "
            "Tests use a temp SQLite file; check DATABASE_URL / disk."
        )
    yield
    try:
        Base.metadata.drop_all(bind=engine)
    except Exception:
        pass


@pytest.fixture
def _clean_tables(_db_setup) -> Iterator[None]:
    from app.database import Base, SessionLocal, engine
    from app.models.settings import Settings

    # Seed the singleton org-settings row (id=1), exactly as
    # `app.cli.init_db` does in every real deployment. Without it,
    # login's `db.get(Settings, 1) or Settings(id=1)` fallback yields
    # an un-flushed object whose int columns are None -> 500.
    with SessionLocal() as db:
        if db.get(Settings, 1) is None:
            db.add(Settings(id=1))
            db.commit()

    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture
def client(_clean_tables):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.rate_limit import _reset

    _reset()  # rate limit counters are global; clear between tests
    return TestClient(app)


@pytest.fixture
def signing_helpers():
    """Build an HMAC signature helper bound to a specific device secret."""
    import hashlib
    import hmac
    import time

    def signature(secret: str, method: str, path: str, body: bytes) -> str:
        t = int(time.time())
        body_hash = hashlib.sha256(body).hexdigest()
        signed = f"{method.upper()}\n{path}\n{t}\n{body_hash}".encode()
        mac = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
        return f"t={t},v1={mac}"

    return signature
