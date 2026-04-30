"""Verify security-hardening rollout health. Read-only. Safe to run in prod.

Usage:
    cd backend && python -m app.cli.verify_hardening | jq
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

from ..database import engine


def _alembic_head(errors: list[str]) -> str | None:
    """Return the code-side Alembic head revision (reads scripts, not the DB)."""
    try:
        ini = Path(__file__).resolve().parents[2] / "alembic.ini"
        cfg = Config(str(ini))
        script_dir = ScriptDirectory.from_config(cfg)
        heads = script_dir.get_heads()
        return heads[0] if heads else None
    except Exception as exc:
        errors.append(f"alembic_head: {exc}")
        return None


def _schema_check(errors: list[str]) -> dict[str, bool]:
    result: dict[str, bool] = {
        "users.password_changed_at": False,
        "devices.refresh_token_jti": False,
        "hmac_nonces": False,
        "audit_logs": False,
    }
    try:
        insp = inspect(engine)
        tables = set(insp.get_table_names())

        if "users" in tables:
            cols = {c["name"] for c in insp.get_columns("users")}
            result["users.password_changed_at"] = "password_changed_at" in cols

        if "devices" in tables:
            cols = {c["name"] for c in insp.get_columns("devices")}
            result["devices.refresh_token_jti"] = "refresh_token_jti" in cols

        result["hmac_nonces"] = "hmac_nonces" in tables
        result["audit_logs"] = "audit_logs" in tables
    except Exception as exc:
        errors.append(f"schema_check: {exc}")
    return result


def _audit_logs_stats(errors: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {
        "count": None,
        "oldest_created_at": None,
        "newest_created_at": None,
        "by_action": {},
    }
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM audit_logs")
            ).one()
            count, oldest, newest = row
            out["count"] = int(count)
            out["oldest_created_at"] = oldest.isoformat() if oldest else None
            out["newest_created_at"] = newest.isoformat() if newest else None

            if count:
                rows = conn.execute(
                    text(
                        "SELECT action, COUNT(*) AS n FROM audit_logs"
                        " GROUP BY action ORDER BY n DESC"
                    )
                ).all()
                out["by_action"] = {r.action: int(r.n) for r in rows}
    except Exception as exc:
        errors.append(f"audit_logs_stats: {exc}")
    return out


def _hmac_nonces_stats(errors: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {"count": None, "max_expires_at": None, "expired_rows": None}
    try:
        now_utc = datetime.now(timezone.utc)
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT COUNT(*), MAX(expires_at) FROM hmac_nonces")
            ).one()
            count, max_exp = row
            out["count"] = int(count)
            out["max_expires_at"] = max_exp.isoformat() if max_exp else None

            expired = conn.execute(
                text("SELECT COUNT(*) FROM hmac_nonces WHERE expires_at < :now"),
                {"now": now_utc},
            ).scalar()
            out["expired_rows"] = int(expired) if expired is not None else None
    except Exception as exc:
        errors.append(f"hmac_nonces_stats: {exc}")
    return out


def _devices_rotation(errors: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {"total": None, "with_jti": None, "without_jti": None}
    try:
        with engine.connect() as conn:
            total = conn.execute(text("SELECT COUNT(*) FROM devices")).scalar()
            with_jti = conn.execute(
                text("SELECT COUNT(*) FROM devices WHERE refresh_token_jti IS NOT NULL")
            ).scalar()
            total_int = int(total) if total is not None else 0
            with_jti_int = int(with_jti) if with_jti is not None else 0
            out["total"] = total_int
            out["with_jti"] = with_jti_int
            out["without_jti"] = total_int - with_jti_int
    except Exception as exc:
        errors.append(f"devices_rotation: {exc}")
    return out


def _recent_log_signals(errors: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {
        "rate_limit_exceeded": [],
        "refresh_token_reuse_detected": [],
        "log_file_present": False,
    }
    log_path = Path("logs/app.log")
    if not log_path.exists():
        return out

    out["log_file_present"] = True
    try:
        rate_hits: list[dict] = []
        reuse_hits: list[dict] = []
        with log_path.open(errors="replace") as fh:
            for raw in fh:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    entry = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                msg = str(entry.get("message") or entry.get("msg") or "").lower()
                if "rate limit exceeded" in msg:
                    rate_hits.append(entry)
                if "refresh token reuse detected" in msg:
                    reuse_hits.append(entry)
        out["rate_limit_exceeded"] = rate_hits[-5:]
        out["refresh_token_reuse_detected"] = reuse_hits[-5:]
    except Exception as exc:
        errors.append(f"recent_log_signals: {exc}")
    return out


def main() -> None:
    errors: list[str] = []

    report: dict[str, Any] = {
        "alembic_head": _alembic_head(errors),
        "schema": _schema_check(errors),
        "audit_logs": _audit_logs_stats(errors),
        "hmac_nonces": _hmac_nonces_stats(errors),
        "devices_rotation": _devices_rotation(errors),
        "recent_log_signals": _recent_log_signals(errors),
        "errors": errors,
    }

    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()
