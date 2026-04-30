"""Issue + verify 6-digit email codes.

Codes are stored only as SHA-256 hashes. Each row has a per-code salt baked
into the hash input so two users can't collide on the same code.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import BackgroundTasks
from sqlalchemy import and_, desc, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..logging_config import get_logger
from ..models.email_verification import EmailVerification
from ..models.user import User
from . import email as email_svc

_log = get_logger("verification")


class VerificationError(Exception):
    """User-visible verification failure."""


def _hash(code: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{code}".encode()).hexdigest()


def _generate_code() -> str:
    # 6 digits, zero-padded, cryptographic RNG.
    return f"{secrets.randbelow(1_000_000):06d}"


def _latest_pending(db: Session, user_id) -> EmailVerification | None:
    return db.execute(
        select(EmailVerification)
        .where(
            and_(
                EmailVerification.user_id == user_id,
                EmailVerification.used_at.is_(None),
                EmailVerification.invalidated_at.is_(None),
            )
        )
        .order_by(desc(EmailVerification.created_at))
        .limit(1)
    ).scalar_one_or_none()


def _safe_send(to: str, code: str, ttl_min: int) -> None:
    """Background-task wrapper that swallows email errors so a transient
    Gmail/SMTP failure doesn't bubble out into the request lifecycle."""
    try:
        email_svc.send_verification_code(to, code, ttl_min)
    except Exception:
        _log.exception("verification email send failed", extra={"to": to})


def issue_and_send(
    db: Session,
    user: User,
    *,
    enforce_cooldown: bool = True,
    background: BackgroundTasks | None = None,
) -> EmailVerification:
    """Generate + persist a new code. The actual email is dispatched after
    the request commits via `background` if provided, else synchronously."""
    s = get_settings()
    now = datetime.now(timezone.utc)

    existing = _latest_pending(db, user.id)
    if existing is not None:
        if enforce_cooldown:
            age = (now - existing.created_at).total_seconds()
            if age < s.verification_resend_cooldown_sec:
                wait = int(s.verification_resend_cooldown_sec - age)
                raise VerificationError(f"please wait {wait}s before requesting a new code")
        existing.invalidated_at = now

    code = _generate_code()
    salt = secrets.token_urlsafe(16)
    row = EmailVerification(
        user_id=user.id,
        code_hash=f"{salt}${_hash(code, salt)}",
        expires_at=now + timedelta(minutes=s.verification_code_ttl_min),
    )
    db.add(row)
    db.flush()

    if background is not None:
        background.add_task(_safe_send, user.email, code, s.verification_code_ttl_min)
    else:
        _safe_send(user.email, code, s.verification_code_ttl_min)
    return row


def verify(db: Session, user: User, code: str) -> None:
    s = get_settings()
    now = datetime.now(timezone.utc)
    row = _latest_pending(db, user.id)
    if row is None:
        raise VerificationError("no pending verification — request a new code")
    if now > row.expires_at:
        row.invalidated_at = now
        raise VerificationError("code expired — request a new one")

    salt, expected = row.code_hash.split("$", 1)
    row.attempts += 1
    if not hmac.compare_digest(_hash(code, salt), expected):
        if row.attempts >= s.verification_max_attempts:
            row.invalidated_at = now
            raise VerificationError("too many wrong attempts — request a new code")
        raise VerificationError("invalid code")

    row.used_at = now
    user.email_verified_at = now
