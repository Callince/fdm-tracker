"""Per-device HMAC-SHA256 request signing.

Header format:  X-Device-Signature: t=<unix_ts>,v1=<hex_mac>
Signed payload: f"{method}\n{path}\n{t}\n{sha256(body)}"
"""
from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ParsedSignature:
    timestamp: int
    mac_hex: str


def parse_signature(header: str) -> ParsedSignature:
    parts = {}
    for seg in header.split(","):
        if "=" not in seg:
            continue
        k, v = seg.split("=", 1)
        parts[k.strip()] = v.strip()
    if "t" not in parts or "v1" not in parts:
        raise ValueError("signature header missing t or v1")
    try:
        t = int(parts["t"])
    except ValueError as e:
        raise ValueError("signature timestamp not int") from e
    return ParsedSignature(timestamp=t, mac_hex=parts["v1"])


def compute_mac(secret: str, method: str, path: str, t: int, body: bytes) -> str:
    body_hash = hashlib.sha256(body).hexdigest()
    signed = f"{method.upper()}\n{path}\n{t}\n{body_hash}".encode()
    return hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()


def verify(
    header: Optional[str],
    secret: str,
    method: str,
    path: str,
    body: bytes,
    max_skew_sec: int,
) -> ParsedSignature:
    if not header:
        raise ValueError("missing X-Device-Signature")
    parsed = parse_signature(header)
    now = int(time.time())
    if abs(now - parsed.timestamp) > max_skew_sec:
        raise ValueError("signature timestamp outside skew window")
    expected = compute_mac(secret, method, path, parsed.timestamp, body)
    if not hmac.compare_digest(expected, parsed.mac_hex):
        raise ValueError("signature mismatch")
    return parsed
