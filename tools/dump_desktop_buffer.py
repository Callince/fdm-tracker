"""Safely extract the FDM Tracker desktop app's local data.

The desktop app (Electron) keeps an offline SQLite buffer
(``buffer.sqlite`` + WAL) plus small JSON state files under its
userData dir. This tool *copies* those files (never opens the live
ones), applies the WAL, and dumps every table to CSV + a summary.

Stdlib only (sqlite3, csv, shutil) — no deps, no network.

Usage:
    python tools/dump_desktop_buffer.py [USERDATA_DIR] [OUT_DIR]

Defaults:
    USERDATA_DIR = %APPDATA%/fdm-tracker-desktop
    OUT_DIR      = ./desktop-data-export
"""
from __future__ import annotations

import csv
import os
import shutil
import sqlite3
import sys
from datetime import datetime, timezone

JSON_SIDE_FILES = ("auth.json", "prefs.json", "widget-state.json",
                    "window-state.json", ".updaterId", "Preferences")


def _fmt_hms(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 3600}h {(s % 3600) // 60}m {s % 60}s"


def main() -> int:
    userdata = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.environ.get("APPDATA", ""), "fdm-tracker-desktop")
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.getcwd(), "desktop-data-export")

    if not os.path.isdir(userdata):
        print(f"userData dir not found: {userdata}", file=sys.stderr)
        return 2

    raw = os.path.join(out, "raw")
    csv_dir = os.path.join(out, "csv")
    os.makedirs(raw, exist_ok=True)
    os.makedirs(csv_dir, exist_ok=True)

    # 1. Copy the sqlite triplet + side files verbatim (forensic snapshot).
    db_src = os.path.join(userdata, "buffer.sqlite")
    if not os.path.exists(db_src):
        print(f"buffer.sqlite not found in {userdata}", file=sys.stderr)
        return 2
    for suffix in ("", "-wal", "-shm"):
        p = db_src + suffix
        if os.path.exists(p):
            shutil.copy2(p, os.path.join(raw, "buffer.sqlite" + suffix))
    for name in JSON_SIDE_FILES:
        p = os.path.join(userdata, name)
        if os.path.exists(p):
            shutil.copy2(p, os.path.join(raw, name))
    logs_src = os.path.join(userdata, "logs")
    if os.path.isdir(logs_src):
        shutil.copytree(logs_src, os.path.join(raw, "logs"), dirs_exist_ok=True)

    # 2. Open the *copy*, fold the WAL in, dump every table to CSV.
    db_copy = os.path.join(raw, "buffer.sqlite")
    con = sqlite3.connect(db_copy)
    con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    tables = [r[0] for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' ORDER BY name")]

    print(f"userData : {userdata}")
    print(f"output   : {out}\n")
    summary: list[str] = []
    for t in tables:
        cur = con.execute(f"SELECT * FROM '{t}'")
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        with open(os.path.join(csv_dir, f"{t}.csv"), "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(cols)
            w.writerows(rows)
        print(f"  {t:<18} {len(rows):>7,} rows -> csv/{t}.csv")
        summary.append(f"{t}: {len(rows)} rows")

    # 3. Human-readable highlights for activity_buckets.
    if "activity_buckets" in tables:
        row = con.execute(
            "SELECT COUNT(*), "
            "COALESCE(SUM(active_seconds),0), COALESCE(SUM(idle_seconds),0), "
            "MIN(bucket_start), MAX(bucket_start), "
            "SUM(CASE WHEN synced_at IS NULL THEN 1 ELSE 0 END) "
            "FROM activity_buckets").fetchone()
        n, act, idle, lo, hi, pending = row
        print("\n  activity_buckets summary")
        print(f"    range        : {lo}  ->  {hi}")
        print(f"    active time  : {_fmt_hms(act)}  ({act:,}s)")
        print(f"    idle time    : {_fmt_hms(idle)}  ({idle:,}s)")
        print(f"    unsynced     : {pending} of {n} buckets")
        summary += [
            f"activity range: {lo} -> {hi}",
            f"active: {_fmt_hms(act)}; idle: {_fmt_hms(idle)}",
            f"unsynced buckets: {pending}/{n}",
        ]

    con.close()

    with open(os.path.join(out, "SUMMARY.txt"), "w", encoding="utf-8") as fh:
        fh.write(f"FDM Tracker desktop data export\n"
                 f"generated: {datetime.now(timezone.utc).isoformat()}\n"
                 f"source   : {userdata}\n\n" + "\n".join(summary) + "\n")
    print(f"\nDone. Raw snapshot + CSVs + SUMMARY.txt under: {out}")
    print("NOTE: raw/auth.json holds device tokens — treat the export as sensitive.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
