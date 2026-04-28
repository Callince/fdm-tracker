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

## Production

See `deploy/README.md` in the repo root.
