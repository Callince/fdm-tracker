# Local SQLite copy of the database

Copies the entire production DB into a single local SQLite file and lets
the backend run against it offline.

> The output `.db` contains **every employee's** data and bcrypt password
> hashes. Treat it like the production database: encrypted disk, never
> commit it, never share it. `fdm_local.db` should be git-ignored.

## Prerequisite — restore the source DB (only you can do this)

The export reads from live Postgres. Production Supabase
(`ymxijdlzmsxndsbwqpwg`) is currently paused/unreachable, so first:

1. https://supabase.com/dashboard → project `ymxijdlzmsxndsbwqpwg`.
2. If **Paused** → **Restore / Resume** (takes a few minutes). If the
   project is gone, use the old Neon rollback URL commented in
   `backend/.env` as `--source` instead.
3. Verify it is reachable again:
   ```
   curl https://api.fourdm.services/health/ready   # -> {"status":"ready"}
   ```

## Step 1 — export to SQLite

Run inside the api container (it already has psycopg2 + the source URL):

```bash
cd ~/fdm/deploy   # production host
docker compose -f docker-compose.prod.yml exec api \
  python -m app.cli.export_sqlite /app/fdm_local.db
docker compose -f docker-compose.prod.yml cp api:/app/fdm_local.db ./fdm_local.db
```

Local dev host instead (source = `DATABASE_URL` in `backend/.env`):

```bash
cd d:\FDM\backend
docker compose run --rm api python -m app.cli.export_sqlite /app/fdm_local.db
docker compose run --rm -v ${PWD}:/out api cp /app/fdm_local.db /out/fdm_local.db
```

Use a stale Neon snapshot instead of Supabase:

```bash
python -m app.cli.export_sqlite ./fdm_local.db \
  --source "postgresql+psycopg2://USER:PASS@ep-young-pond-aosj3er9.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
```

The script prints per-table row counts and recreates the file each run.

## Step 2 — run the backend on the SQLite file

`alembic upgrade head` does **not** run on SQLite (migrations emit
Postgres-only DDL). The schema already exists inside the exported file,
so skip Alembic and start uvicorn directly:

```powershell
cd d:\FDM\backend
# Windows absolute path: 3 slashes then the drive, forward slashes.
$env:DATABASE_URL = "sqlite:///D:/FDM/backend/fdm_local.db"
uvicorn app.main:app --reload --port 8000
```

(POSIX/Docker absolute path uses four slashes: `sqlite:////app/fdm_local.db`.)

`app/database.py` auto-detects the `sqlite://` URL and switches engine
args; `app/sqlite_compat.py` makes the Postgres-typed models compile on
SQLite. Nothing on the Postgres/production path changes.

## Verify

```bash
curl http://localhost:8000/health/ready          # -> {"status":"ready"}
sqlite3 fdm_local.db "SELECT count(*) FROM users; SELECT email,role FROM users;"
```

Then sign in normally — it now reads from the local file.

## Refresh later

Re-run Step 1; the file is rebuilt from scratch each time. It is a
point-in-time copy — writes against SQLite do **not** sync back to
Postgres.
