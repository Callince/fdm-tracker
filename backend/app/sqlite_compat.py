"""SQLite DDL compatibility for the Postgres-typed ORM.

Every model binds columns to ``sqlalchemy.dialects.postgresql`` types
(``UUID``, ``JSONB``). SQLAlchemy 2.0's ``Uuid`` base already handles
value conversion cross-dialect, but the *DDL text* for these types is
not defined for the SQLite type compiler. Importing this module
registers SQLite-only compilers so ``Base.metadata.create_all()`` and
ad-hoc queries work against a ``sqlite://`` engine.

Scope is restricted to the ``"sqlite"`` dialect, so Postgres DDL
(production) is completely unaffected. Import is idempotent.
"""
from __future__ import annotations

from sqlalchemy.dialects.postgresql import JSONB, UUID
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
