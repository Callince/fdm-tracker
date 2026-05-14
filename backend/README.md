# FDM Tracker — Backend

FastAPI + PostgreSQL. Single-tenant. Stateless API.

## Local dev

```bash
cp .env.example .env
docker compose up --build
# api runs on :8000, swagger at /docs
```

Seed the first admin:

```bash
docker compose exec api python -m app.cli.seed_admin "Admin" digital@fourdm.com "ChangeMeNow!"
```

## Migrations

```bash
# create a new revision after changing a model
alembic revision --autogenerate -m "message"
alembic upgrade head
```

## Nightly summary rebuild

```bash
python -m app.cli.rebuild_summaries          # yesterday + today
python -m app.cli.rebuild_summaries 2026-04-20
```

## Type check / lint / test

```bash
mypy --strict app
ruff check app
pytest
```

## Verifying the security hardening rollout

After deploying the 2026-04-30 hardening migration (`20260430_0010_security_hardening`), run the verification CLI against the production database:

```bash
cd backend
python -m app.cli.verify_hardening | jq
```

The tool is **read-only** — it never writes to the database. It prints a single JSON object:

| Field | What it tells you |
|---|---|
| `alembic_head` | Code-side head revision. Should be `20260430_0010`. If it differs, a newer migration was added after the hardening commit. |
| `schema.users.password_changed_at` | `true` if the column exists in the DB. |
| `schema.devices.refresh_token_jti` | `true` if the column exists in the DB. |
| `schema.hmac_nonces` | `true` if the table exists. |
| `schema.audit_logs` | `true` if the table exists. |
| `audit_logs.count` | Total rows written so far. Should be growing if admins are making mutations. |
| `audit_logs.by_action` | Counts per action string — useful for spotting missing instrumentation. |
| `hmac_nonces.count` | Current live nonce rows. |
| `hmac_nonces.expired_rows` | Rows past `expires_at`. A large number means the GC job is lagging. |
| `devices_rotation.with_jti` | Devices that have a JTI (have logged in since the rollout). |
| `devices_rotation.without_jti` | Devices that haven't refreshed yet — expected to be non-zero shortly after deploy. |
| `recent_log_signals.rate_limit_exceeded` | Last 5 log lines containing "rate limit exceeded". |
| `recent_log_signals.refresh_token_reuse_detected` | Last 5 log lines containing "refresh token reuse detected". |
| `errors` | Present only if something failed; contains per-check error messages. Remaining fields are still populated where possible. |

This is a one-shot verification tool intended to be removed once the rollout is confirmed healthy.

## Production

See `deploy/README.md` in the repo root.
