"""Sanity checks on incoming activity batches.

Raises cost of cheating; does not claim to stop a determined attacker.
Rejected buckets do not abort the batch — we record the reason and skip.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List, Tuple

from ..config import get_settings
from ..schemas.activity import ActivityBucket


@dataclass
class BucketVerdict:
    bucket: ActivityBucket
    ok: bool
    reason: str = ""


def _future(ts: datetime) -> bool:
    return ts > datetime.now(timezone.utc) + timedelta(minutes=2)


def _too_old(ts: datetime, *, max_age_days: int = 14) -> bool:
    return ts < datetime.now(timezone.utc) - timedelta(days=max_age_days)


def check_bucket(b: ActivityBucket) -> BucketVerdict:
    s = get_settings()

    if b.active_seconds + b.idle_seconds > 60:
        return BucketVerdict(b, False, "active+idle > 60s")

    if _future(b.bucket_start):
        return BucketVerdict(b, False, "bucket_start in future")

    if _too_old(b.bucket_start):
        return BucketVerdict(b, False, "bucket_start too old")

    if b.keystroke_count > s.max_keystrokes_per_min:
        return BucketVerdict(b, False, "keystroke_count exceeds cap")

    if b.mouse_event_count > s.max_mouse_events_per_min:
        return BucketVerdict(b, False, "mouse_event_count exceeds cap")

    # Mouse jiggler heuristic: active seconds with zero keystrokes and
    # unnaturally uniform mouse rate is flagged but not rejected — the
    # admin sees it in reports. We accept for now.
    return BucketVerdict(b, True)


def detect_jiggler(recent: List[Tuple[int, int]]) -> bool:
    """recent = list of (mouse_events, keystrokes) for the last N buckets.

    Flags mouse events with zero keystrokes where every bucket's rate is
    within 5% of the mean — a jiggler signature.
    """
    if len(recent) < 10:
        return False
    mouse = [m for m, _ in recent]
    keys = sum(k for _, k in recent)
    if keys > 0:
        return False
    if any(m == 0 for m in mouse):
        return False
    mean = sum(mouse) / len(mouse)
    if mean < 10:
        return False
    return all(abs(m - mean) / mean < 0.05 for m in mouse)
