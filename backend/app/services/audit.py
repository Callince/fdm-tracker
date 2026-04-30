"""Audit log helpers."""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from ..models.audit_log import AuditLog


def record(
    db: Session,
    *,
    actor_id: uuid.UUID | None,
    action: str,
    target_type: str,
    target_id: uuid.UUID | None = None,
    diff: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    request_id = None
    ip = None
    if request is not None:
        request_id = getattr(request.state, "request_id", None)
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            ip = fwd.split(",")[0].strip()
        elif request.client is not None:
            ip = request.client.host
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            diff=diff,
            request_id=request_id,
            ip=ip,
        )
    )
