# FDM Tracker — Production deploy

One Docker Compose stack on a single droplet:

- **api** — FastAPI (uvicorn, 2 workers) on internal port 8000
- **admin** — Next.js standalone server on internal port 3000
- **caddy** — reverse proxy with auto-HTTPS via Let's Encrypt

The database is Neon (managed Postgres) — not run on the droplet.

---

## Prerequisites

1. A DigitalOcean droplet (Ubuntu 22.04 or 24.04, 1 GB RAM minimum).
2. A domain you control (e.g. `fourdm.com`). Two A records pointing at the droplet IP:
   - `admin.fourdm.com` → droplet IP
   - `api.fourdm.com` → droplet IP
3. Neon project ready (we already have one).

---

## Step 1 — Provision the droplet

SSH in as root, then:

```bash
# Update + install Docker
apt-get update && apt-get upgrade -y
curl -fsSL https://get.docker.com | sh

# Open the firewall (UFW)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Create a non-root deploy user (optional but recommended)
adduser deploy
usermod -aG docker deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/
```

From here on, work as `deploy`.

---

## Step 2 — Get the code on the droplet

```bash
git clone <your-repo-url> ~/fdm
cd ~/fdm/deploy
cp .env.example .env
```

Edit `.env`:

- Set `ADMIN_DOMAIN` and `API_DOMAIN` to your real subdomains.
- Set `NEXT_PUBLIC_API_BASE` to `https://<API_DOMAIN>` (must match exactly).
- Paste the real Neon `DATABASE_URL` (the one we already wired locally).
- Generate a real `JWT_SECRET`:
  ```bash
  openssl rand -hex 64
  ```
- Set `CORS_ORIGINS=https://<ADMIN_DOMAIN>` (drop localhost entries).
- Paste your Gmail OAuth creds (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`).

---

## Step 3 — First boot

DNS must already resolve to the droplet IP — Caddy needs that to obtain certs.

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml logs -f
```

First boot takes ~3–5 minutes (image builds + cert issuance). When you see `certificate obtained successfully` from Caddy, you're live.

Alembic runs automatically inside the api container on every boot.

---

## Step 4 — Seed the first admin against the prod DB

The admin you seeded locally already exists in Neon (same DB). Verify by visiting `https://<ADMIN_DOMAIN>` and logging in with `digital@fourdm.com` / `Admin@123`.

If you ever need to reset:

```bash
docker compose -f docker-compose.prod.yml exec api \
  python -m app.cli.seed_admin "Tamil (Admin)" digital@fourdm.com "<new-password>"
```

---

## Step 5 — Build the desktop installer

On your **local Windows machine** (not the droplet):

```powershell
cd d:\FDM\desktop
$env:FDM_API_BASE = "https://api.your-domain.com"
npm run dist:win
```

Installer drops in `desktop/release/`. Distribute the `.exe` to employees.

---

## Operations

```bash
# Tail logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f admin

# Pull updates and restart
git -C ~/fdm pull
docker compose -f docker-compose.prod.yml up -d --build

# Run a one-off script (e.g. summary rebuild)
docker compose -f docker-compose.prod.yml exec api \
  python -m app.cli.rebuild_summaries

# Stop everything
docker compose -f docker-compose.prod.yml down
```

---

## Troubleshooting

- **Caddy can't get a cert** — check DNS resolves to the droplet IP, and ports 80/443 are open. `dig <ADMIN_DOMAIN>` from your laptop.
- **502 from admin** — `docker compose logs admin`. Usually means the build failed; rebuild with `--build`.
- **DB connection refused** — verify `DATABASE_URL` in `.env` and that the droplet can reach Neon (`docker compose exec api python -c "from app.database import engine; print(engine.connect())"`).
- **JWT errors after redeploy** — if you changed `JWT_SECRET`, all existing tokens are invalidated. Users have to log in again. Expected.
