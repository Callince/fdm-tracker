"""SQLAlchemy engine, session factory, and declarative base.

The application runs exclusively on SQLite. ``app.sqlite_compat``
registers the DDL compilers that let the (Postgres-typed) ORM models
materialise on a ``sqlite://`` engine.
"""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    """Project-wide declarative base."""


_settings = get_settings()

# Register the Postgres-type -> SQLite DDL compilers before any
# metadata DDL or query compiles.
from . import sqlite_compat  # noqa: E402,F401

engine = create_engine(
    _settings.database_url,
    # SQLite + a threaded ASGI server: the connection may be used
    # from a worker thread other than the one that created it.
    connect_args={"check_same_thread": False},
    future=True,
)


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_conn, _record):  # type: ignore[no-untyped-def]
    cur = dbapi_conn.cursor()
    # Enforce ON DELETE CASCADE / SET NULL (off by default in SQLite).
    cur.execute("PRAGMA foreign_keys=ON")
    # WAL lets readers run during a write; busy_timeout makes a
    # blocked writer wait instead of erroring "database is locked"
    # immediately. Both matter when many desktop clients push
    # activity concurrently against the single SQLite file.
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.execute("PRAGMA busy_timeout=10000")  # ms
    cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
