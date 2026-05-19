# FDM Tracker — Backend

FastAPI + SQLite. Single-tenant. Stateless API.

## Local dev

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
# api runs on :8000, swagger at /docs
```

Or without Docker (host Python):

```bash
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
python -m app.cli.init_db          # create the SQLite schema
.venv/Scripts/uvicorn app.main:app --reload --port 8000
```

Seed the first admin:

```bash
docker compose exec api python -m app.cli.seed_admin "Admin" digital@fourdm.com "ChangeMeNow!"
```

## Schema

There are no migrations. SQLite is the only database and the schema is
materialised from the ORM models by `python -m app.cli.init_db`, which
runs on every boot and is idempotent (only creates missing tables).

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

## Production

See `deploy/README.md` in the repo root.
