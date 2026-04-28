"""Nightly rebuild of daily_summary.

Usage:
    python -m app.cli.rebuild_summaries              # yesterday + today, all users
    python -m app.cli.rebuild_summaries 2026-04-20   # specific date, all users

Meant to be called from a systemd timer or cron.
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, timedelta, timezone
from typing import List

from sqlalchemy import select
from zoneinfo import ZoneInfo

from ..database import SessionLocal
from ..logging_config import configure_logging, get_logger
from ..models.settings import Settings as OrgSettings
from ..models.user import User
from ..services.summary import _workday_date, rebuild_daily_summary


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Rebuild daily summaries")
    p.add_argument("target_date", nargs="?", help="YYYY-MM-DD (user-local); default = yesterday+today")
    return p.parse_args()


def _target_dates(arg: str | None, tz: ZoneInfo, start_hour: int) -> List[date]:
    if arg:
        return [date.fromisoformat(arg)]
    today = _workday_date(datetime.now(timezone.utc), tz, start_hour)
    return [today - timedelta(days=1), today]


def main() -> int:
    configure_logging()
    log = get_logger("rebuild_summaries")
    args = _parse_args()

    with SessionLocal() as db:
        org = db.get(OrgSettings, 1) or OrgSettings(id=1)
        users = db.execute(select(User).where(User.is_active.is_(True))).scalars().all()

        total = 0
        for u in users:
            tz = ZoneInfo(u.timezone)
            for d in _target_dates(args.target_date, tz, org.workday_start_hour):
                rebuild_daily_summary(db, u, d)
                total += 1
        db.commit()
        log.info("rebuild complete", extra={"rows": total, "users": len(users)})
    return 0


if __name__ == "__main__":
    sys.exit(main())
