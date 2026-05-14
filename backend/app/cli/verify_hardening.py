"""Read-only verification CLI for the 2026-04-30 security-hardening rollout.

Usage (from backend/):
    python -m app.cli.verify_hardening
    python -m app.cli.verify_hardening | jq

Safe to run in production — no writes, no destructive operations.
Partial results are returned on error; check the top-level 'errors' key.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from alembic.config import Config as AlembicConfig
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

from ..database import engine

# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------

_ALEMBIC_INI = Path(__file__).parent.parent.parent / "alembic.ini"


def _check_alembic_head() -> str:
    cfg = AlembicConfig(str(_ALEMBIC_INI))
    script = ScriptDirectory.from_config(cfg)
    return script.get_current_head() or "unknown"


def _check_schema(conn: Any) -> dict[str, bool]:
    insp = inspect(conn)
    tables = set(insp.get_table_names())
    user_cols = {c["name"] for c in insp.get_columns("users")} if "users" in tables else set()
    device_cols = {c["name"] for c in insp.get_columns("devices")} if "devices" in tables else set()
    return {
        "users.password_changed_at": "password_changed_at" in user_cols,
        "devices.refresh_token_jti": "refresh_token_jti" in device_cols,
        "hmac_nonces": "hmac_nonces" in tables,
        "audit_logs": "audit_logs" in tables,
    }


def _check_audit_logs(conn: Any) -> dict[str, Any]:
    row = conn.execute(
        text("SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest, MAX(created_at) AS newest FROM audit_logs")
    ).one()
    if row.cnt == 0:
        return {"count": 0, "oldest_created_at": None, "newest_created_at": None, "by_action": {}}
    by_action = conn.execute(
        text("SELECT action, COUNT(*) AS cnt FROM audit_logs GROUP BY action ORDER BY cnt DESC")
    ).all()
    return {
        "count": row.cnt,
        "oldest_created_at": row.oldest.isoformat() if row.oldest else None,
        "newest_created_at": row.newest.isoformat() if row.newest else None,
        "by_action": {r.action: r.cnt for r in by_action},
    }


def _check_hmac_nonces(conn: Any) -> dict[str, Any]:
    row = conn.execute(
        text("SELECT COUNT(*) AS cnt, MAX(expires_at) AS max_exp FROM hmac_nonces")
    ).one()
    expired = conn.execute(
        text("SELECT COUNT(*) FROM hmac_nonces WHERE expires_at < NOW()")
    ).scalar()
    return {
        "count": row.cnt,
        "max_expires_at": row.max_exp.isoformat() if row.max_exp else None,
        "expired_rows": expired,
    }


def _check_devices_rotation(conn: Any) -> dict[str, Any]:
    row = conn.execute(
        text(
            "SELECT COUNT(*) AS total,"
            " SUM(CASE WHEN refresh_token_jti IS NOT NULL THEN 1 ELSE 0 END) AS with_jti,"
            " SUM(CASE WHEN refresh_token_jti IS NULL THEN 1 ELSE 0 END) AS without_jti"
            " FROM devices"
        )
    ).one()
    return {
        "total": row.total,
        "with_jti": row.with_jti or 0,
        "without_jti": row.without_jti or 0,
    }


def _check_log_signals() -> dict[str, Any]:
    log_path = Path("./logs/app.log")
    if not log_path.exists():
        return {
            "log_found": False,
            "rate_limit_exceeded": [],
            "refresh_token_reuse_detected": [],
        }

    rate_limit: list[dict] = []
    reuse: list[dict] = []
    with log_path.open(errors="replace") as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                continue
            msg = str(obj.get("message", obj.get("msg", obj.get("event", "")))).lower()
            if "rate limit exceeded" in msg:
                rate_limit.append(obj)
            elif "refresh token reuse detected" in msg:
                reuse.append(obj)

    return {
        "log_found": True,
        "rate_limit_exceeded": rate_limit[-5:],
        "refresh_token_reuse_detected": reuse[-5:],
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    errors: list[str] = []
    result: dict[str, Any] = {}

    # Alembic head — code-side, no DB required
    try:
        result["alembic_head"] = _check_alembic_head()
    except Exception as exc:
        errors.append(f"alembic_head: {exc}")
        result["alembic_head"] = None

    # All DB-dependent checks share one connection
    try:
        with engine.connect() as conn:
            try:
                result["schema"] = _check_schema(conn)
            except Exception as exc:
                errors.append(f"schema: {exc}")
                result["schema"] = None

            try:
                result["audit_logs"] = _check_audit_logs(conn)
            except Exception as exc:
                errors.append(f"audit_logs: {exc}")
                result["audit_logs"] = None

            try:
                result["hmac_nonces"] = _check_hmac_nonces(conn)
            except Exception as exc:
                errors.append(f"hmac_nonces: {exc}")
                result["hmac_nonces"] = None

            try:
                result["devices_rotation"] = _check_devices_rotation(conn)
            except Exception as exc:
                errors.append(f"devices_rotation: {exc}")
                result["devices_rotation"] = None

    except Exception as exc:
        errors.append(f"db_connect: {exc}")
        for key in ("schema", "audit_logs", "hmac_nonces", "devices_rotation"):
            result.setdefault(key, None)

    # Log-file scan — no DB required
    try:
        result["recent_log_signals"] = _check_log_signals()
    except Exception as exc:
        errors.append(f"recent_log_signals: {exc}")
        result["recent_log_signals"] = None

    if errors:
        result["errors"] = errors

    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
