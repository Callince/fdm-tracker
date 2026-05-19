# Production SQLite — deploy runbook

> **SQLite is the system of record.** The app serves from a single
> SQLite file on a persistent named volume on the droplet. Properties
> of this setup:
> - **Single writer** — runs 1 uvicorn worker; heavy concurrent client
>   pushes will serialise (WAL + 10s busy_timeout soften this).
> - **No Alembic** — schema comes from the ORM (`init_db`); future
>   schema changes are applied by `init_db` on boot, not migrations.
> - **Unless data was migrated in**, the DB starts fresh — employees
>   re-register. To preserve old data, run `app.cli.export_sqlite`
>   against a reachable Postgres first (see backend/SQLITE_EXPORT.md).
>
> Postgres remains fully supported as a rollback (see "Revert", below).

## 1. Get the code onto the droplet

These changes must be in the branch the droplet checks out:
`app/database.py` (dialect-aware + WAL/busy_timeout), `app/sqlite_compat.py`,
`app/cli/init_db.py`, `deploy/docker-compose.sqlite.yml`.

```bash
ssh deploy@<droplet-ip>
cd ~/fdm
git fetch origin
git checkout <branch>          # or: git pull, if merged to the deployed branch
```

## 2. Build + start with the SQLite override

```bash
cd ~/fdm/deploy
docker compose -f docker-compose.prod.yml -f docker-compose.sqlite.yml \
  --env-file .env up -d --build
docker compose -f docker-compose.prod.yml -f docker-compose.sqlite.yml \
  logs -f api      # watch for "created N tables" / "seeded settings row"
```

`init_db` is idempotent — it runs on every boot, creates the schema if
absent, and never drops data on the `fdm_sqlite` volume.

## 3. Seed the admin (one-off; password not committed anywhere)

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.sqlite.yml \
  exec api python -m app.cli.seed_admin "Tamil (Admin)" digital@fourdm.com '<STRONG_PASSWORD>'
```

Re-running this command later just resets that admin's password.

## 4. Verify

```bash
curl https://api.fourdm.services/health/ready          # {"status":"ready"}
curl -s -X POST https://api.fourdm.services/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"digital@fourdm.com","password":"<STRONG_PASSWORD>",
       "device_label":"probe","device_platform":"web",
       "device_fingerprint":"probe-fingerprint-0001"}' | head -c 200
```

A token in the response = the desktop app and admin browser will now
sign in. No client change needed — same API domain via Caddy.

## Operations

```bash
# The SQLite file lives on the named volume `fdm-tracker_fdm_sqlite`.
# Back it up (do this regularly — it is now your only copy):
docker compose -f docker-compose.prod.yml -f docker-compose.sqlite.yml \
  exec api sh -c 'cp /data/fdm.db /data/fdm.backup-$(date +%F).db'
docker compose -f docker-compose.prod.yml -f docker-compose.sqlite.yml \
  cp api:/data/fdm.db ./fdm-prod-backup.db    # pull a copy off the box

# Tail logs
docker compose -f docker-compose.prod.yml -f docker-compose.sqlite.yml logs -f api
```

## Revert to Postgres (the real fix)

Once Supabase is restored (or a new Postgres is provisioned):

1. Put the working Postgres URL back in `deploy/.env` (`DATABASE_URL`).
2. Optionally migrate the SQLite stopgap data into Postgres first
   (reverse of `app.cli.export_sqlite` — ask before doing this; it
   merges fresh-period data into the restored history).
3. Redeploy **without** the override:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env up -d --build
   ```
   That restores Alembic + 2 workers + Postgres. The `fdm_sqlite`
   volume is left intact until you `docker volume rm` it.
