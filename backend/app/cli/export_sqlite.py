"""Copy the entire database into a local SQLite file.

Reads from the Postgres URL in settings (``DATABASE_URL``) — or an
explicit ``--source`` — and writes every table, in foreign-key-safe
order, into a fresh SQLite file. Type conversion (UUID, JSONB,
timestamptz) is handled by SQLAlchemy via the shared model metadata.

Usage (run inside the api container, which has psycopg2 + deps)::

    python -m app.cli.export_sqlite [TARGET_DB] [--source POSTGRES_URL]

    TARGET_DB   output path (default: ./fdm_local.db); recreated each run.
    --source    override the source URL (default: settings.database_url).

The output file contains every employee's data and bcrypt password
hashes — treat it as sensitive (encrypted disk, never commit / share).
"""
from __future__ import annotations

import argparse
import os
import sys

from sqlalchemy import create_engine, select

from app.database import Base
from app.config import get_settings

# Populate Base.metadata with every table, and register the
# Postgres-type -> SQLite DDL compilers for the target engine.
import app.models  # noqa: F401,E402
from app import sqlite_compat  # noqa: F401,E402

_CHUNK = 5_000


def main() -> int:
    ap = argparse.ArgumentParser(prog="export_sqlite")
    ap.add_argument("target", nargs="?", default="./fdm_local.db")
    ap.add_argument("--source", default=None,
                    help="source SQLAlchemy URL (default: settings.database_url)")
    args = ap.parse_args()

    source_url = args.source or os.environ.get("SOURCE_DATABASE_URL") or get_settings().database_url
    if source_url.startswith("sqlite"):
        print("refusing to export: source is sqlite, expected Postgres", file=sys.stderr)
        return 2

    target_path = os.path.abspath(args.target)
    if os.path.exists(target_path):
        os.remove(target_path)  # always a clean snapshot
    target_url = f"sqlite:///{target_path}"

    src = create_engine(source_url, future=True)
    dst = create_engine(target_url, future=True)

    # Smoke-test the source first so a paused/unreachable DB fails
    # loudly here, not midway through a partial copy.
    with src.connect() as c:
        c.exec_driver_sql("SELECT 1")

    Base.metadata.create_all(dst)

    tables = Base.metadata.sorted_tables  # FK dependency order
    total = 0
    with src.connect() as sconn, dst.begin() as dconn:
        for table in tables:
            result = sconn.execution_options(stream_results=True).execute(select(table))
            keys = result.keys()
            n = 0
            while True:
                batch = result.fetchmany(_CHUNK)
                if not batch:
                    break
                dconn.execute(
                    table.insert(),
                    [dict(zip(keys, row)) for row in batch],
                )
                n += len(batch)
            total += n
            print(f"  {table.name:<22} {n:>9,} rows")

    print(f"\nDone. {total:,} rows -> {target_path}")
    print("Point the backend at it with:")
    print(f'  DATABASE_URL="{target_url}"')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
