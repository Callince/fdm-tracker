"""SQLAlchemy engine, session factory, and declarative base.

Production runs on Postgres (psycopg2). A local ``sqlite://`` URL is
also supported for an offline copy of the data — see
``app.cli.export_sqlite`` and ``app.sqlite_compat``.
"""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    """Project-wide declarative base."""


_settings = get_settings()
_url = make_url(_settings.database_url)
_is_sqlite = _url.get_backend_name() == "sqlite"

if _is_sqlite:
    # Register the Postgres-type -> SQLite DDL compilers before any
    # metadata DDL or query compiles.
    from . import sqlite_compat  # noqa: F401

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
else:
    engine = create_engine(
        _settings.database_url,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=10,
        max_overflow=20,
        # Fail fast when the pool is exhausted instead of hanging the request
        # forever. 30s gives a slow-but-recovering DB time to free a slot but
        # surfaces a 5xx (retryable) instead of a request timeout from upstream.
        pool_timeout=30,
        future=True,
        connect_args={"keepalives": 1, "keepalives_idle": 30, "keepalives_interval": 10, "keepalives_count": 3},
    )

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
