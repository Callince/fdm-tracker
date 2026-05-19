# Production SQLite — deploy runbook

> **SQLite is the only database.** The app serves from a single SQLite
> file on the persistent `fdm_sqlite` Docker volume on the droplet.
> Properties of this setup:
> - **Single writer** — 1 uvicorn worker; heavy concurrent client
>   pushes serialise (WAL + 10s busy_timeout soften this).
> - **No migrations** — the schema comes from the ORM via `init_db`,
>   which runs on every boot (idempotent; never drops data).
> - **The volume starts empty** — create the admin (step 3) and,
>   optionally, import recovered desktop activity (step 4).

## 1. Get the code onto the droplet

```bash
ssh deploy@<droplet-ip>
cd ~/fdm
git fetch origin
git checkout <branch>          # or: git pull, if merged to the deployed branch
```

## 2. Build + start

The prod compose is SQLite-native — no override file needed.

```bash
cd ~/fdm/deploy
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml logs -f api   # watch for "created N tables"
```

## 3. Seed the admin (one-off; password not committed anywhere)

```bash
docker compose -f docker-compose.prod.yml \
  exec api python -m app.cli.seed_admin "Tamil (Admin)" digital@fourdm.com '<STRONG_PASSWORD>'
```

Re-running this later just resets that admin's password.

## 4. (Optional) Import recovered desktop activity

If you have a `desktop-data-export/csv/activity_buckets.csv` to restore,
copy it onto the box and run the importer (idempotent — re-runs only add
new buckets). Run **after** step 3 so it attributes to the real admin:

```bash
docker compose -f docker-compose.prod.yml cp \
  ./activity_buckets.csv api:/tmp/activity_buckets.csv
docker compose -f docker-compose.prod.yml \
  exec api python -m app.cli.import_desktop_buffer /tmp/activity_buckets.csv \
  --email digital@fourdm.com
```

## 5. Verify

```bash
curl https://api.fourdm.services/health/ready          # {"status":"ready"}
curl -s -X POST https://api.fourdm.services/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"digital@fourdm.com","password":"<STRONG_PASSWORD>",
       "device_label":"probe","device_platform":"web",
       "device_fingerprint":"probe-fingerprint-0001"}' | head -c 200
```

A token in the response = the desktop app and admin browser will sign
in. No client change needed — same API domain via Caddy.

## Operations

```bash
# The SQLite file lives on the named volume `fdm-tracker_fdm_sqlite`.
# Back it up regularly — it is the only copy:
docker compose -f docker-compose.prod.yml \
  exec api sh -c 'cp /data/fdm.db /data/fdm.backup-$(date +%F).db'
docker compose -f docker-compose.prod.yml \
  cp api:/data/fdm.db ./fdm-prod-backup.db    # pull a copy off the box

# Tail logs
docker compose -f docker-compose.prod.yml logs -f api
```
