"""End-to-end smoke across every API endpoint.

Not a unit test — a scripted walk through the full server with real HTTP.
Assumes uvicorn is running on http://127.0.0.1:8000 and an admin exists
(digital@fourdm.com / ChangeMeNow!).
"""
from __future__ import annotations

import io
import os
import hashlib
import hmac
import json
import re
import secrets
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", line_buffering=True)

BASE = "http://127.0.0.1:8000"
ADMIN_EMAIL = "digital@fourdm.com"
ADMIN_PASS = "ChangeMeNow!"

# Path to the uvicorn log so we can read console-backend verification codes.
UVICORN_LOG = Path(sys.argv[1]) if len(sys.argv) > 1 else None

PASS = "\033[32mPASS\033[0m"
FAIL = "\033[31mFAIL\033[0m"


def _stamp(label: str, ok: bool, extra: str = "") -> bool:
    print(f"  [{PASS if ok else FAIL}] {label}  {extra}")
    return ok


def sign(secret: str, method: str, path: str, body: bytes) -> dict[str, str]:
    t = int(time.time())
    body_hash = hashlib.sha256(body).hexdigest()
    mac = hmac.new(
        secret.encode(),
        f"{method.upper()}\n{path}\n{t}\n{body_hash}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return {"X-Device-Signature": f"t={t},v1={mac}"}


def pull_verification_code(email: str, before_ts: float) -> str | None:
    """Scan uvicorn log for the most recent console-backend code for `email`
    emitted after `before_ts` (epoch seconds)."""
    if UVICORN_LOG is None or not UVICORN_LOG.exists():
        return None
    # Console-email log line is plain text mixed into the JSON stream; grep.
    text = UVICORN_LOG.read_text(errors="ignore")
    hits = []
    # Each log line is JSON-ish; find the ones mentioning the target email and a code.
    for m in re.finditer(r"\[console-email\] to=(?P<to>\S+)\s+subject=.*?code is:\s*(?P<code>\d{6})",
                         text, re.DOTALL):
        if m.group("to") == email:
            hits.append(m.group("code"))
    return hits[-1] if hits else None


results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    _stamp(name, ok, detail)


def section(title: str) -> None:
    print(f"\n=== {title} ===")


# --------------------------------------------------------------------------- #
# 1. meta
# --------------------------------------------------------------------------- #
section("meta")
r = requests.get(f"{BASE}/health", timeout=5)
check("GET /health", r.status_code == 200 and r.json().get("status") == "ok", r.text[:80])

r = requests.get(f"{BASE}/openapi.json", timeout=5)
check("GET /openapi.json", r.status_code == 200, f"{len(r.content)} bytes")

# --------------------------------------------------------------------------- #
# 2. signup / verify / resend / login
# --------------------------------------------------------------------------- #
section("signup + email verification")

unique = uuid.uuid4().hex[:8]
user_email = f"fdm-e2e-{unique}@fourdm.com"
user_pw = "E2eTester2026!"

t0 = time.time()
r = requests.post(f"{BASE}/auth/signup", json={
    "name": "E2E Tester", "email": user_email, "password": user_pw,
})
check("POST /auth/signup (allowed domain)", r.status_code == 201 and r.json()["verification_required"] is True)

r = requests.post(f"{BASE}/auth/signup", json={
    "name": "Bad", "email": "bad@gmail.com", "password": "whatever123",
})
check("POST /auth/signup rejects non-allowlisted domain", r.status_code == 400)

r = requests.post(f"{BASE}/auth/signup", json={
    "name": "Dup", "email": user_email, "password": user_pw,
})
check("POST /auth/signup 409 on duplicate", r.status_code == 409)

r = requests.post(f"{BASE}/auth/login", json={
    "email": user_email, "password": user_pw,
    "device_label": "e2e", "device_platform": "win32",
    "device_fingerprint": f"e2e-{unique}-fp",
})
check("POST /auth/login blocked until verification", r.status_code == 403)

r = requests.post(f"{BASE}/auth/verify-email", json={"email": user_email, "code": "000000"})
check("POST /auth/verify-email wrong code -> 400", r.status_code == 400)

time.sleep(0.5)
code = pull_verification_code(user_email, t0)
if code is None:
    print(f"  (!) could not read code from log {UVICORN_LOG}")
    code = "000000"

r = requests.post(f"{BASE}/auth/verify-email", json={"email": user_email, "code": code})
check("POST /auth/verify-email real code", r.status_code == 200)

r = requests.post(f"{BASE}/auth/verify-email", json={"email": user_email, "code": code})
check("POST /auth/verify-email idempotent (already verified)", r.status_code == 200)

r = requests.post(f"{BASE}/auth/resend-verification", json={"email": "nope@fourdm.com"})
check("POST /auth/resend-verification generic on unknown email", r.status_code == 200)

# --------------------------------------------------------------------------- #
# 3. admin login + refresh + user CRUD
# --------------------------------------------------------------------------- #
section("admin auth + user CRUD")

r = requests.post(f"{BASE}/auth/login", json={
    "email": ADMIN_EMAIL, "password": ADMIN_PASS,
    "device_label": "admin-e2e", "device_platform": "win32",
    "device_fingerprint": f"admin-e2e-{unique}",
})
check("POST /auth/login admin", r.status_code == 200)
admin_data = r.json()
admin_tok = admin_data["tokens"]["access_token"]
admin_refresh = admin_data["tokens"]["refresh_token"]
admin_device_id = admin_data["device"]["device_id"]
admin_device_secret = admin_data["device"]["device_secret"]
admin_auth = {"Authorization": f"Bearer {admin_tok}"}

r = requests.post(f"{BASE}/auth/refresh", json={"refresh_token": admin_refresh})
check("POST /auth/refresh", r.status_code == 200 and "access_token" in r.json())

r = requests.get(f"{BASE}/admin/users", headers=admin_auth)
check("GET /admin/users", r.status_code == 200 and any(u["email"] == ADMIN_EMAIL for u in r.json()["users"]))

new_email = f"fdm-created-{unique}@fourdm.com"
r = requests.post(f"{BASE}/admin/users", headers=admin_auth, json={
    "name": "Created by Admin", "email": new_email, "password": "Temp1234!",
    "role": "user", "timezone": "Asia/Kolkata",
})
check("POST /admin/users", r.status_code == 201)
created_id = r.json()["id"]

r = requests.get(f"{BASE}/admin/users/{created_id}", headers=admin_auth)
check("GET /admin/users/{id}", r.status_code == 200 and r.json()["email"] == new_email)

r = requests.patch(f"{BASE}/admin/users/{created_id}", headers=admin_auth,
                   json={"name": "Renamed", "is_active": False})
check("PATCH /admin/users/{id}", r.status_code == 200 and r.json()["name"] == "Renamed")

# Refuse last-admin demotion
admin_id = next(u["id"] for u in requests.get(f"{BASE}/admin/users", headers=admin_auth).json()["users"] if u["email"] == ADMIN_EMAIL)
r = requests.patch(f"{BASE}/admin/users/{admin_id}", headers=admin_auth, json={"role": "user"})
check("PATCH refuses last-admin demotion", r.status_code == 400)

r = requests.get(f"{BASE}/admin/activity/live", headers=admin_auth)
check("GET /admin/activity/live", r.status_code == 200 and "users" in r.json())

r = requests.get(f"{BASE}/admin/settings", headers=admin_auth)
check("GET /admin/settings", r.status_code == 200)

r = requests.put(f"{BASE}/admin/settings", headers=admin_auth,
                 json={"idle_threshold_minutes": 7, "workday_start_hour": 4})
check("PUT /admin/settings", r.status_code == 200 and r.json()["idle_threshold_minutes"] == 7)

today = datetime.now(timezone.utc).date()
frm, to = today - timedelta(days=3), today
r = requests.get(f"{BASE}/admin/users/{admin_id}/daily-summary",
                 headers=admin_auth, params={"from": frm.isoformat(), "to": to.isoformat()})
check("GET /admin/users/{id}/daily-summary", r.status_code == 200 and "days" in r.json())

r = requests.get(f"{BASE}/admin/users/{admin_id}/day-details",
                 headers=admin_auth, params={"date": today.isoformat()})
check("GET /admin/users/{id}/day-details", r.status_code == 200 and "sessions" in r.json())

r = requests.get(f"{BASE}/admin/reports",
                 headers=admin_auth,
                 params={"from": frm.isoformat(), "to": to.isoformat(), "format": "json"})
check("GET /admin/reports format=json", r.status_code == 200 and "rows" in r.json())

r = requests.get(f"{BASE}/admin/reports",
                 headers=admin_auth,
                 params={"from": frm.isoformat(), "to": to.isoformat(), "format": "csv"})
check("GET /admin/reports format=csv", r.status_code == 200 and r.text.startswith("user_id,"))

# --------------------------------------------------------------------------- #
# 4. tracker flow: /sessions, /activity, /breaks, /me
# --------------------------------------------------------------------------- #
section("tracker flow (HMAC-signed)")

# Log in as the newly-verified e2e user
r = requests.post(f"{BASE}/auth/login", json={
    "email": user_email, "password": user_pw,
    "device_label": "e2e-tracker", "device_platform": "win32",
    "device_fingerprint": f"e2e-tracker-{unique}",
})
check("POST /auth/login (verified user)", r.status_code == 200)
udata = r.json()
u_tok = udata["tokens"]["access_token"]
u_device_id = udata["device"]["device_id"]
u_secret = udata["device"]["device_secret"]
u_auth = {"Authorization": f"Bearer {u_tok}"}


def signed_post(path: str, payload: dict[str, Any]) -> requests.Response:
    body = json.dumps(payload, separators=(",", ":")).encode()
    h = {**u_auth, "Content-Type": "application/json", **sign(u_secret, "POST", path, body)}
    return requests.post(f"{BASE}{path}", data=body, headers=h)


now = datetime.now(timezone.utc)
r = signed_post("/sessions/start", {"started_at": now.isoformat()})
check("POST /sessions/start", r.status_code == 200)
session_id = r.json()["session_id"]

# HMAC tamper check
body = json.dumps({"started_at": now.isoformat()}).encode()
bad = {**u_auth, "Content-Type": "application/json", "X-Device-Signature": f"t={int(time.time())},v1={'0'*64}"}
r = requests.post(f"{BASE}/sessions/start", data=body, headers=bad)
check("HMAC mismatch rejected", r.status_code == 401)

# Activity batch
buckets = []
for i in range(3):
    buckets.append({
        "client_event_id": str(uuid.uuid4()),
        "session_id": session_id,
        "bucket_start": (now - timedelta(minutes=i + 1)).isoformat(),
        "active_seconds": 45, "idle_seconds": 15,
        "keystroke_count": 80, "mouse_event_count": 220,
    })
r = signed_post("/activity/batch", {"buckets": buckets})
check("POST /activity/batch (3 buckets)", r.status_code == 200 and r.json()["accepted"] == 3)

r = signed_post("/activity/batch", {"buckets": buckets})
check("POST /activity/batch dedupes on replay", r.status_code == 200 and r.json()["deduplicated"] == 3)

# Anti-spoof: active+idle > 60s
bad_bucket = {
    "client_event_id": str(uuid.uuid4()), "session_id": session_id,
    "bucket_start": now.isoformat(),
    "active_seconds": 50, "idle_seconds": 30,
    "keystroke_count": 1, "mouse_event_count": 1,
}
r = signed_post("/activity/batch", {"buckets": [bad_bucket]})
check("anti-spoof rejects active+idle>60", r.status_code == 200 and r.json()["rejected"] == 1)

# Breaks
r = signed_post("/breaks/start", {"session_id": session_id, "started_at": now.isoformat(), "reason": "coffee"})
check("POST /breaks/start", r.status_code == 200)
break_id = r.json()["break_id"]

r = signed_post("/breaks/start", {"session_id": session_id, "started_at": now.isoformat()})
check("POST /breaks/start 409 on overlap", r.status_code == 409)

end_ts = (now + timedelta(minutes=5)).isoformat()
r = signed_post("/breaks/end", {"break_id": break_id, "ended_at": end_ts})
check("POST /breaks/end", r.status_code == 200)

# /me endpoints
r = requests.get(f"{BASE}/me/daily-summary", headers=u_auth,
                 params={"from": frm.isoformat(), "to": to.isoformat()})
check("GET /me/daily-summary", r.status_code == 200)

r = requests.get(f"{BASE}/me/day-details", headers=u_auth, params={"date": today.isoformat()})
check("GET /me/day-details", r.status_code == 200 and len(r.json()["sessions"]) >= 1)

# End session
r = signed_post("/sessions/end", {"session_id": session_id, "ended_at": (now + timedelta(hours=1)).isoformat()})
check("POST /sessions/end", r.status_code == 200)

# Regular user cannot hit admin routes
r = requests.get(f"{BASE}/admin/users", headers=u_auth)
check("GET /admin/users forbidden for non-admin", r.status_code == 403)

# Logout
r = requests.post(f"{BASE}/auth/logout", headers=u_auth)
check("POST /auth/logout", r.status_code == 204)

# --------------------------------------------------------------------------- #
# summary
# --------------------------------------------------------------------------- #
total = len(results)
passed = sum(1 for _, ok, _ in results if ok)
print(f"\n=== {passed}/{total} passed ===")
if passed != total:
    for name, ok, detail in results:
        if not ok:
            print(f"  FAIL: {name} :: {detail}")
    sys.exit(1)
