"""Import the desktop app's offline activity buffer into the database.

The desktop Electron app buffers 60-second activity buckets locally
(``buffer.sqlite``); ``tools/dump_desktop_buffer.py`` dumps them to
``desktop-data-export/csv/activity_buckets.csv``. That CSV carries the
activity numbers and a client-generated ``session_id``, but **no
identity** — the real ``users``/``devices``/``work_sessions`` rows were
created server-side. The live ``/activity/batch`` ingest can't be
reused for a bulk restore: it requires an authenticated, HMAC-signed
device request per batch.

This CLI reconstructs the missing identity so the data lands in
``activity_logs``:

  * ensure an admin ``users`` row (created if absent — set a real
    password afterwards with ``app.cli.seed_admin``);
  * one synthetic ``devices`` row, keyed by a fixed fingerprint so
    re-runs reuse it;
  * one ``work_sessions`` row per distinct ``session_id`` (the CSV's
    UUID is used as the PK so the activity FK lines up), spanning that
    session's first→last bucket;
  * the buckets as ``activity_logs``.

Idempotent and dialect-agnostic: existing ``client_event_id``s for the
import device are skipped (portable SELECT-then-INSERT, not
``ON CONFLICT``), so re-running only adds new rows.

Usage (DATABASE_URL points at the target — SQLite by default)::

    python -m app.cli.import_desktop_buffer [CSV_PATH] \
        [--email digital@fourdm.com] [--name "Tamil (Admin)"]

    CSV_PATH  default: <repo>/desktop-data-export/csv/activity_buckets.csv
"""
from __future__ import annotations

import argparse
import csv
import secrets
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import func, select

from ..database import SessionLocal, engine
from ..models.activity import ActivityLog
from ..models.device import Device
from ..models.session import WorkSession
from ..models.user import User
from ..security import hash_password

# app/cli/this_file -> app -> backend -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_CSV = _REPO_ROOT / "desktop-data-export" / "csv" / "activity_buckets.csv"

# Fixed so re-runs reuse the same synthetic device (and its dedup set).
_IMPORT_FINGERPRINT = "desktop-buffer-import"
_CHUNK = 1000


def _parse_ts(raw: str) -> datetime:
    """Parse the CSV's ISO-8601 UTC timestamps (``...Z``) tz-aware."""
    return datetime.fromisoformat(raw.strip().replace("Z", "+00:00"))


def _fmt_hms(seconds: int) -> str:
    return f"{seconds // 3600}h {(seconds % 3600) // 60}m {seconds % 60}s"


def main() -> int:
    ap = argparse.ArgumentParser(prog="import_desktop_buffer")
    ap.add_argument("csv_path", nargs="?", default=str(_DEFAULT_CSV))
    ap.add_argument("--email", default="digital@fourdm.com")
    ap.add_argument("--name", default="Tamil (Admin)")
    args = ap.parse_args()

    csv_path = Path(args.csv_path)
    if not csv_path.is_file():
        print(f"CSV not found: {csv_path}", file=sys.stderr)
        return 2
    email = args.email.strip().lower()

    # Read + group buckets by session up front so we can derive each
    # session's [start, end] window before inserting anything.
    sessions: dict[uuid.UUID, list[dict]] = {}
    skipped_blank = 0
    with csv_path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if not row.get("client_event_id") or not row.get("session_id"):
                skipped_blank += 1
                continue
            sid = uuid.UUID(row["session_id"])
            sessions.setdefault(sid, []).append(
                {
                    "client_event_id": uuid.UUID(row["client_event_id"]),
                    "bucket_start": _parse_ts(row["bucket_start"]),
                    "active_seconds": int(row["active_seconds"] or 0),
                    "idle_seconds": int(row["idle_seconds"] or 0),
                    "keystroke_count": int(row["keystroke_count"] or 0),
                    "mouse_event_count": int(row["mouse_event_count"] or 0),
                }
            )

    total_buckets = sum(len(v) for v in sessions.values())
    if total_buckets == 0:
        print("no buckets to import", file=sys.stderr)
        return 2
    print(f"DB         : {engine.url}")
    print(f"source CSV : {csv_path}")
    print(f"parsed     : {total_buckets:,} buckets across {len(sessions)} sessions"
          + (f" ({skipped_blank} blank rows skipped)" if skipped_blank else ""))

    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        # --- user ----------------------------------------------------------
        user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if user is None:
            user = User(
                name=args.name,
                email=email,
                # Unusable until reset — password not committed anywhere.
                password_hash=hash_password(secrets.token_urlsafe(32)),
                role="admin",
                email_verified_at=now,
            )
            db.add(user)
            db.flush()
            print(f"user       : created admin {email} "
                  f"(set a real password: python -m app.cli.seed_admin "
                  f'"{args.name}" {email} "<password>")')
        else:
            print(f"user       : reusing existing {email} (role={user.role})")

        # --- device --------------------------------------------------------
        device = db.execute(
            select(Device).where(
                Device.user_id == user.id,
                Device.fingerprint == _IMPORT_FINGERPRINT,
            )
        ).scalar_one_or_none()
        if device is None:
            device = Device(
                user_id=user.id,
                label="Imported Desktop Buffer",
                platform="win32",  # export source: C:\Users\...\AppData\Roaming
                fingerprint=_IMPORT_FINGERPRINT,
                device_secret=secrets.token_hex(32),
                last_seen_at=now,
            )
            db.add(device)
            db.flush()
            print(f"device     : created '{device.label}' ({device.id})")
        else:
            print(f"device     : reusing '{device.label}' ({device.id})")

        # --- work_sessions -------------------------------------------------
        existing_sessions = set(
            db.execute(select(WorkSession.id)).scalars().all()
        )
        created_sessions = 0
        for sid, buckets in sessions.items():
            if sid in existing_sessions:
                continue
            starts = [b["bucket_start"] for b in buckets]
            db.add(
                WorkSession(
                    id=sid,
                    user_id=user.id,
                    device_id=device.id,
                    started_at=min(starts),
                    # buckets are 60s windows; end ~one window past the last.
                    ended_at=max(starts) + timedelta(seconds=60),
                )
            )
            created_sessions += 1
        db.flush()
        print(f"sessions   : {created_sessions} created, "
              f"{len(sessions) - created_sessions} already present")

        # --- activity_logs (portable dedup on this device) -----------------
        seen = set(
            db.execute(
                select(ActivityLog.client_event_id).where(
                    ActivityLog.device_id == device.id
                )
            ).scalars().all()
        )
        # activity_logs.id is a BigInteger PK. On Postgres that's a
        # BIGSERIAL (the live ingest path); on SQLite only an
        # ``INTEGER PRIMARY KEY`` aliases rowid, so a bulk core insert
        # must supply id explicitly. Continue past any existing rows.
        next_id = (db.execute(select(func.max(ActivityLog.id))).scalar() or 0) + 1

        rows: list[dict] = []
        act_total = idle_total = 0
        for sid, buckets in sessions.items():
            for b in buckets:
                act_total += b["active_seconds"]
                idle_total += b["idle_seconds"]
                if b["client_event_id"] in seen:
                    continue
                rows.append(
                    {
                        "id": next_id,
                        "user_id": user.id,
                        "session_id": sid,
                        "device_id": device.id,
                        "client_event_id": b["client_event_id"],
                        "bucket_start": b["bucket_start"],
                        "active_seconds": b["active_seconds"],
                        "idle_seconds": b["idle_seconds"],
                        "keystroke_count": b["keystroke_count"],
                        "mouse_event_count": b["mouse_event_count"],
                        "created_at": now,
                    }
                )
                next_id += 1

        inserted = 0
        for i in range(0, len(rows), _CHUNK):
            chunk = rows[i : i + _CHUNK]
            db.execute(ActivityLog.__table__.insert(), chunk)
            inserted += len(chunk)

        device.last_seen_at = now
        db.commit()

    deduped = total_buckets - skipped_blank - inserted
    print(f"activity   : {inserted:,} inserted, {deduped:,} already present (skipped)")
    print(f"totals     : active {_fmt_hms(act_total)} ({act_total:,}s), "
          f"idle {_fmt_hms(idle_total)} ({idle_total:,}s)")
    print("done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
