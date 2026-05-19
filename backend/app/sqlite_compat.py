"""SQLite DDL compatibility for the ORM.

SQLite is the only database. The models still bind columns to
``sqlalchemy.dialects.postgresql`` types (``UUID``, ``JSONB``) — kept
because SQLAlchemy 2.0's ``Uuid`` base handles value conversion and
rewriting every model is needless churn — but the *DDL text* for those
types, and for autoincrement ``BigInteger`` primary keys, needs SQLite
definitions. Importing this module registers them so
``Base.metadata.create_all()`` and queries work on a ``sqlite://``
engine. Import is idempotent.
"""
from __future__ import annotations

from datetime import timezone

import sqlalchemy as sa
from sqlalchemy import BigInteger
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.dialects.sqlite import DATETIME as _SQLITE_DATETIME
from sqlalchemy.dialects.sqlite.pysqlite import SQLiteDialect_pysqlite
from sqlalchemy.ext.compiler import compiles


@compiles(UUID, "sqlite")
def _uuid_sqlite(element, compiler, **kw):  # type: ignore[no-untyped-def]
    # 32 hex chars (no dashes) — matches SQLAlchemy's Uuid base storage.
    # The Uuid base type still does the str<->uuid.UUID conversion.
    return "CHAR(32)"


@compiles(JSONB, "sqlite")
def _jsonb_sqlite(element, compiler, **kw):  # type: ignore[no-untyped-def]
    # SQLite (3.9+) understands JSON; the JSON base type handles
    # json.dumps/loads via the dialect serializer.
    return "JSON"


@compiles(BigInteger, "sqlite")
def _bigint_sqlite(element, compiler, **kw):  # type: ignore[no-untyped-def]
    # SQLite only auto-increments an ``INTEGER PRIMARY KEY`` (a rowid
    # alias); a ``BIGINT PRIMARY KEY`` is NOT NULL with no default, so
    # core inserts that omit the id fail. Emitting INTEGER makes the
    # autoincrement PKs (activity_logs, audit_logs, break_logs, …) work.
    # SQLite stores all integers as variable-width up to 8 bytes, so
    # there is no value-range loss versus BIGINT.
    return "INTEGER"


class _UTCDateTime(_SQLITE_DATETIME):
    """Timezone-aware DateTime for SQLite.

    SQLite has no tz-aware datetime type, so ``DateTime(timezone=True)``
    is a no-op there and values read back are tz-*naive*. Comparing
    those with the tz-aware ``datetime.now(timezone.utc)`` the app uses
    everywhere (token revocation, HMAC nonce / verification expiry,
    session duration, summaries) raises "can't compare offset-naive and
    offset-aware datetimes". This subclass keeps SQLite's TEXT<->datetime
    parsing and just normalises: aware values are stored as UTC, and
    every value read back is tagged UTC.
    """

    def bind_processor(self, dialect):  # type: ignore[no-untyped-def]
        base = super().bind_processor(dialect)
        def process(value):  # type: ignore[no-untyped-def]
            if value is not None and value.tzinfo is not None:
                value = value.astimezone(timezone.utc).replace(tzinfo=None)
            return base(value) if base else value
        return process

    def result_processor(self, dialect, coltype):  # type: ignore[no-untyped-def]
        base = super().result_processor(dialect, coltype)
        def process(value):  # type: ignore[no-untyped-def]
            v = base(value) if base else value
            if v is not None and v.tzinfo is None:
                v = v.replace(tzinfo=timezone.utc)
            return v
        return process


# Route every generic ``DateTime`` column through _UTCDateTime on
# SQLite. Set on the dialect class (not an engine) so it is in effect
# before app.database creates the engine; idempotent.
SQLiteDialect_pysqlite.colspecs = {
    **SQLiteDialect_pysqlite.colspecs,
    sa.DateTime: _UTCDateTime,
}
