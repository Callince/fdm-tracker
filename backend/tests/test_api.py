"""End-to-end API tests.

These exercise the auth → session → activity → summary path through the
real FastAPI stack and a real Postgres. The dev DB needs to exist and be
reachable (see conftest.DATABASE_URL).
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient


def _seed_admin(email: str = "admin@fourdm.com", password: str = "adminpw1234") -> tuple[str, str]:
    from app.database import SessionLocal
    from app.models.user import User
    from app.security import hash_password

    db = SessionLocal()
    try:
        u = User(
            name="Test Admin",
            email=email,
            password_hash=hash_password(password),
            role="admin",
            is_active=True,
            email_verified_at=datetime.now(timezone.utc),
        )
        db.add(u)
        db.commit()
    finally:
        db.close()
    return email, password


def _login(client: TestClient, email: str, password: str) -> dict:
    resp = client.post(
        "/auth/login",
        json={
            "email": email,
            "password": password,
            "device_label": "test-host",
            "device_platform": "linux",
            "device_fingerprint": uuid.uuid4().hex,
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_signup_creates_unverified_user(client: TestClient) -> None:
    resp = client.post(
        "/auth/signup",
        json={
            "name": "Alice",
            "email": "alice@fourdm.com",
            "password": "supersecret",
            "timezone": "Asia/Kolkata",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["verification_required"] is True
    assert body["email"] == "alice@fourdm.com"

    # Login should be blocked until verification.
    login = client.post(
        "/auth/login",
        json={
            "email": "alice@fourdm.com",
            "password": "supersecret",
            "device_label": "h",
            "device_platform": "linux",
            "device_fingerprint": "abcdefgh1",
        },
    )
    assert login.status_code == 403


def test_signup_rejects_disallowed_domain(client: TestClient) -> None:
    resp = client.post(
        "/auth/signup",
        json={
            "name": "Bob",
            "email": "bob@evil.com",
            "password": "supersecret",
            "timezone": "Asia/Kolkata",
        },
    )
    assert resp.status_code == 400


def test_login_invalid_credentials_constant_time(client: TestClient) -> None:
    """No user in DB → still 401, doesn't 500. (Timing is harder to assert
    in unit tests; we just check the path runs without error.)"""
    resp = client.post(
        "/auth/login",
        json={
            "email": "ghost@fourdm.com",
            "password": "whatever",
            "device_label": "h",
            "device_platform": "linux",
            "device_fingerprint": "abcdefgh",
        },
    )
    assert resp.status_code == 401


def test_login_returns_tokens_and_device(client: TestClient) -> None:
    email, pw = _seed_admin()
    body = _login(client, email, pw)
    assert "access_token" in body["tokens"]
    assert "refresh_token" in body["tokens"]
    assert body["device"]["device_secret"]
    assert body["role"] == "admin"
    assert body["is_new_device"] is True


def test_refresh_rotates_jti(client: TestClient) -> None:
    email, pw = _seed_admin()
    body = _login(client, email, pw)
    refresh = body["tokens"]["refresh_token"]

    r1 = client.post("/auth/refresh", json={"refresh_token": refresh})
    assert r1.status_code == 200, r1.text
    new_refresh = r1.json()["refresh_token"]
    assert new_refresh != refresh

    # Replaying the original refresh token should now fail (rotation+reuse detect).
    replay = client.post("/auth/refresh", json={"refresh_token": refresh})
    assert replay.status_code == 401

    # And the just-issued refresh is now also dead because reuse-detect
    # cleared the jti.
    after = client.post("/auth/refresh", json={"refresh_token": new_refresh})
    assert after.status_code == 401


def test_password_change_revokes_old_tokens(client: TestClient) -> None:
    email, pw = _seed_admin()
    body = _login(client, email, pw)
    access = body["tokens"]["access_token"]

    # Old token works.
    me1 = client.get("/me", headers={"Authorization": f"Bearer {access}"})
    assert me1.status_code == 200

    # Change password.
    rsp = client.post(
        "/me/password",
        headers={"Authorization": f"Bearer {access}"},
        json={"current_password": pw, "new_password": "newsecret123"},
    )
    assert rsp.status_code == 204

    # Old access token now rejected.
    me2 = client.get("/me", headers={"Authorization": f"Bearer {access}"})
    assert me2.status_code == 401

    # Re-login with new password works.
    body2 = _login(client, email, "newsecret123")
    assert body2["tokens"]["access_token"]


def test_admin_disable_revokes_tokens(client: TestClient) -> None:
    """Disable user → their token immediately stops working on next call."""
    email, pw = _seed_admin()
    admin_body = _login(client, email, pw)
    admin_access = admin_body["tokens"]["access_token"]

    # Create a regular user.
    create = client.post(
        "/admin/users",
        headers={"Authorization": f"Bearer {admin_access}"},
        json={
            "name": "Carol",
            "email": "carol@fourdm.com",
            "password": "carolpw1234",
            "role": "user",
            "timezone": "Asia/Kolkata",
        },
    )
    assert create.status_code == 201, create.text
    carol_id = create.json()["id"]
    carol_login = _login(client, "carol@fourdm.com", "carolpw1234")
    carol_token = carol_login["tokens"]["access_token"]

    # Disable Carol.
    patch = client.patch(
        f"/admin/users/{carol_id}",
        headers={"Authorization": f"Bearer {admin_access}"},
        json={"is_active": False},
    )
    assert patch.status_code == 200

    me = client.get("/me", headers={"Authorization": f"Bearer {carol_token}"})
    assert me.status_code == 401


def test_session_uses_server_clock(client: TestClient, signing_helpers) -> None:
    """Client-supplied started_at is ignored; server sets a fresh `now`."""
    email, pw = _seed_admin()
    body = _login(client, email, pw)
    access = body["tokens"]["access_token"]
    secret = body["device"]["device_secret"]

    # Try to backdate by a year.
    payload = json.dumps({"started_at": "2020-01-01T00:00:00+00:00"}).encode()
    sig = signing_helpers(secret, "POST", "/sessions/start", payload)

    resp = client.post(
        "/sessions/start",
        content=payload,
        headers={
            "Authorization": f"Bearer {access}",
            "X-Device-Signature": sig,
            "Content-Type": "application/json",
        },
    )
    assert resp.status_code == 200, resp.text
    started = datetime.fromisoformat(resp.json()["started_at"])
    delta = abs((datetime.now(timezone.utc) - started).total_seconds())
    assert delta < 30, f"server should use its own clock, not 2020 — got delta {delta}s"


def test_hmac_replay_rejected(client: TestClient, signing_helpers) -> None:
    email, pw = _seed_admin()
    body = _login(client, email, pw)
    access = body["tokens"]["access_token"]
    secret = body["device"]["device_secret"]

    payload = b"{}"
    sig = signing_helpers(secret, "POST", "/sessions/start", payload)

    headers = {
        "Authorization": f"Bearer {access}",
        "X-Device-Signature": sig,
        "Content-Type": "application/json",
    }
    r1 = client.post("/sessions/start", content=payload, headers=headers)
    assert r1.status_code == 200, r1.text

    # Same MAC = replay.
    r2 = client.post("/sessions/start", content=payload, headers=headers)
    assert r2.status_code == 401
    assert "replay" in r2.json()["detail"].lower()


def test_audit_log_records_admin_actions(client: TestClient) -> None:
    from app.database import SessionLocal
    from app.models.audit_log import AuditLog

    email, pw = _seed_admin()
    admin_body = _login(client, email, pw)
    admin_access = admin_body["tokens"]["access_token"]

    create = client.post(
        "/admin/users",
        headers={"Authorization": f"Bearer {admin_access}"},
        json={
            "name": "Dan",
            "email": "dan@fourdm.com",
            "password": "danpw12345",
            "role": "user",
            "timezone": "Asia/Kolkata",
        },
    )
    assert create.status_code == 201

    db = SessionLocal()
    try:
        rows = db.query(AuditLog).all()
        actions = {r.action for r in rows}
        assert "user.create" in actions
    finally:
        db.close()


def test_rate_limit_login(client: TestClient) -> None:
    """5/minute limit on login. The 6th call within a minute should 429."""
    _seed_admin()
    payload = {
        "email": "admin@fourdm.com",
        "password": "wrongpassword",
        "device_label": "h",
        "device_platform": "linux",
        "device_fingerprint": "rl-test-x",
    }
    statuses = []
    for _ in range(7):
        r = client.post("/auth/login", json=payload)
        statuses.append(r.status_code)
    # We expect at least one 429 in the run.
    assert 429 in statuses, f"no rate limit hit: {statuses}"
