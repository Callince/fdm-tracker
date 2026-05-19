"""Create all tables on the SQLite database via SQLAlchemy.

This is the schema tool: SQLite is the only database and there are no
migrations — the schema is materialised from the ORM models. Idempotent
(``create_all`` only creates missing tables) and run on every boot.

Usage (DATABASE_URL must point at the target):
    python -m app.cli.init_db
"""
from __future__ import annotations

import sys

from ..database import Base, engine

# Populate Base.metadata with every table.
import app.models  # noqa: F401,E402


def main() -> int:
    backend = engine.url.get_backend_name()
    if backend != "sqlite":
        print(
            f"refusing: DATABASE_URL is '{backend}', not sqlite. "
            "This project runs on SQLite only — set a sqlite:// URL.",
            file=sys.stderr,
        )
        return 2
    Base.metadata.create_all(engine)
    tables = sorted(t.name for t in Base.metadata.sorted_tables)
    print(f"created {len(tables)} tables in {engine.url}:")
    for t in tables:
        print(f"  - {t}")

    # Seed the singleton org-settings row (id=1). Without it, login's
    # `db.get(Settings, 1) or Settings(id=1)` fallback yields an
    # un-flushed object whose int columns are None -> 500. Inserting via
    # the ORM materialises the model-level column defaults.
    from ..database import SessionLocal  # noqa: PLC0415
    from ..models.settings import Settings  # noqa: PLC0415

    with SessionLocal() as db:
        if db.get(Settings, 1) is None:
            db.add(Settings(id=1))
            db.commit()
            print("seeded settings row (id=1)")
        else:
            print("settings row (id=1) already present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
