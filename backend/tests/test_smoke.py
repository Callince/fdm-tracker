"""Pure-unit smoke tests that do not touch the DB."""
from __future__ import annotations

import hashlib
import hmac as hmac_stdlib
import time
import uuid
from datetime import datetime, timezone

from app import hmac_verify
from app.schemas.activity import ActivityBucket
from app.services.anti_spoof import check_bucket, detect_jiggler


def test_hmac_roundtrip() -> None:
    secret = "unittest-secret"
    body = b'{"ok":true}'
    t = int(time.time())
    mac = hmac_verify.compute_mac(secret, "POST", "/activity/batch", t, body)
    header = f"t={t},v1={mac}"
    hmac_verify.verify(header, secret, "POST", "/activity/batch", body, max_skew_sec=60)


def test_hmac_detects_tamper() -> None:
    secret = "unittest-secret"
    body = b'{"ok":true}'
    t = int(time.time())
    mac = hmac_stdlib.new(secret.encode(), b"x", hashlib.sha256).hexdigest()
    header = f"t={t},v1={mac}"
    try:
        hmac_verify.verify(header, secret, "POST", "/activity/batch", body, max_skew_sec=60)
        raise AssertionError("expected mismatch")
    except ValueError:
        pass


def _bucket(**overrides: object) -> ActivityBucket:
    data: dict[str, object] = dict(
        client_event_id=uuid.uuid4(),
        session_id=uuid.uuid4(),
        bucket_start=datetime.now(timezone.utc),
        active_seconds=45,
        idle_seconds=15,
        keystroke_count=50,
        mouse_event_count=200,
    )
    data.update(overrides)
    return ActivityBucket(**data)  # type: ignore[arg-type]


def test_anti_spoof_rejects_oversum() -> None:
    v = check_bucket(_bucket(active_seconds=40, idle_seconds=30))
    assert not v.ok


def test_jiggler_flagged() -> None:
    assert detect_jiggler([(100, 0)] * 12) is True
    assert detect_jiggler([(100, 1)] * 12) is False
