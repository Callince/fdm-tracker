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

After deploying migration `20260430_0010`, run the read-only verification CLI against the production database:

```bash
cd backend && python -m app.cli.verify_hardening | jq
```

The tool connects to whichever `DATABASE_URL` is in the environment and prints a single JSON object.

| Field | What it tells you |
|---|---|
| `alembic_head` | The code-side Alembic head revision. Should be `20260430_0010` once the migration file ships. |
| `schema.users.password_changed_at` | `true` → column exists; the API can force-expire sessions issued before a password change. |
| `schema.devices.refresh_token_jti` | `true` → column exists; refresh-token rotation is wiring JTIs into the devices table. |
| `schema.hmac_nonces` | `true` → replay-prevention table is present. |
| `schema.audit_logs` | `true` → audit log table is present and the app can write to it. |
| `audit_logs.count` | Total rows. Should grow over time as logins, logouts, and admin actions are recorded. |
| `audit_logs.by_action` | Breakdown by action string — handy for spotting missing instrumentation. |
| `hmac_nonces.expired_rows` | Rows with `expires_at < now()`. A large and growing number means the GC background job is lagging. |
| `devices_rotation.without_jti` | Devices that have never completed a refresh-token rotation. Should converge to 0 over the first few days. |
| `recent_log_signals.rate_limit_exceeded` | Last 5 structured-log entries containing "rate limit exceeded" (from `logs/app.log`). |
| `recent_log_signals.refresh_token_reuse_detected` | Last 5 entries containing "refresh token reuse detected" — non-zero is a security signal worth investigating. |
| `errors` | Non-fatal errors encountered during the check (e.g. table not yet migrated). Empty array = clean. |

This CLI is a one-shot verification aid and can be removed once the rollout is confirmed stable.

## Production

See `deploy/README.md` in the repo root.
