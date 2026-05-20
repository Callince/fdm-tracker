<#
  Deploy FDM Tracker (SQLite-only) to the production droplet.

  Run from your own PowerShell (you have ssh/scp + keys):
      powershell -File D:\FDM\deploy\deploy-to-droplet.ps1

  What it does, end to end:
    1. Generates a fresh production JWT secret.
    2. Pulls the working Gmail OAuth creds out of backend/.env.
    3. Writes a production deploy/.env (domains, SQLite URL, CORS).
    4. Takes a *consistent* snapshot of backend/fdm_local.db
       (3165 activity rows + the admin) even while it's in use.
    5. git-archives the committed branch (no secrets, no junk).
    6. Ships archive + env + db snapshot to the droplet over scp.
    7. Installs Docker if missing, builds & starts the prod stack
       (api + admin + Caddy/HTTPS), then loads your snapshot into
       the persistent SQLite volume and restarts the API.
    8. Verifies HTTPS /health/ready and admin login.

  Safe to re-run: each run redeploys and re-seeds from the snapshot.
#>

$ErrorActionPreference = "Stop"

# ---- Config -----------------------------------------------------------------
# Override any of these via env vars (e.g. $env:FDM_DROPLET="1.2.3.4") so the
# committed script is reusable across environments.
$Droplet     = if ($env:FDM_DROPLET)      { $env:FDM_DROPLET }      else { "168.144.16.210" }
$SshUser     = if ($env:FDM_SSH_USER)     { $env:FDM_SSH_USER }     else { "root" }   # deploy@ failed publickey; root authorized
$ApiDomain   = if ($env:FDM_API_DOMAIN)   { $env:FDM_API_DOMAIN }   else { "api.fourdm.services" }
$AdminDomain = if ($env:FDM_ADMIN_DOMAIN) { $env:FDM_ADMIN_DOMAIN } else { "admin.fourdm.services" }
$Repo        = if ($env:FDM_REPO)         { $env:FDM_REPO }         else { $PSScriptRoot | Split-Path -Parent }
$Branch      = if ($env:FDM_BRANCH)       { $env:FDM_BRANCH }       else { "fix/sqlite-prod-fallback" }
$Py          = if ($env:FDM_PYTHON)       { $env:FDM_PYTHON }       else { Join-Path $Repo "backend\.venv\Scripts\python.exe" }
$Target      = "${SshUser}@${Droplet}"
$SshOpts     = @("-o","StrictHostKeyChecking=accept-new","-o","ConnectTimeout=15")

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Die($m)  { Write-Host "FAILED: $m" -ForegroundColor Red; exit 1 }

$work = Join-Path $env:TEMP "fdm-deploy"
New-Item -ItemType Directory -Force -Path $work | Out-Null
$envFile  = Join-Path $work ".env"
$dbSnap   = Join-Path $work "fdm_prod_seed.db"
$srcTgz   = Join-Path $work "fdm-src.tgz"
$remoteSh = Join-Path $work "remote-setup.sh"

# ---- 1. Fresh JWT secret ----------------------------------------------------
Step "Generating production JWT secret"
$jwt = & $Py -c "import secrets;print(secrets.token_hex(64))"
if (-not $jwt) { Die "could not generate JWT secret" }

# ---- 2. Gmail creds from backend/.env --------------------------------------
Step "Reading Gmail OAuth creds from backend/.env"
$benv = @{}
Get-Content "$Repo\backend\.env" | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { $benv[$Matches[1]] = $Matches[2] }
}
foreach ($k in 'GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN') {
  if (-not $benv[$k]) { Die "$k missing in backend/.env" }
}

# ---- 3. Production deploy/.env ---------------------------------------------
Step "Writing production .env"
@"
ADMIN_DOMAIN=$AdminDomain
API_DOMAIN=$ApiDomain
NEXT_PUBLIC_API_BASE=https://$ApiDomain
NEXT_PUBLIC_SENTRY_DSN=

ENV=production
APP_NAME=fdm-tracker
LOG_LEVEL=INFO

DATABASE_URL=sqlite:////data/fdm.db

JWT_SECRET=$jwt
JWT_ALGORITHM=HS256
ACCESS_TOKEN_TTL_MIN=720
REFRESH_TOKEN_TTL_MIN=20160
BCRYPT_ROUNDS=12

HMAC_CLOCK_SKEW_SEC=300
MAX_KEYSTROKES_PER_MIN=1200
MAX_MOUSE_EVENTS_PER_MIN=6000

CORS_ORIGINS=https://$AdminDomain

DEFAULT_IDLE_THRESHOLD_MIN=5
DEFAULT_WORKDAY_START_HOUR=4
DEFAULT_TIMEZONE=Asia/Kolkata

EMAIL_BACKEND=$($benv['EMAIL_BACKEND'])
EMAIL_FROM=$($benv['EMAIL_FROM'])
GMAIL_MODE=$($benv['GMAIL_MODE'])
GMAIL_SENDER=$($benv['GMAIL_SENDER'])
GMAIL_CLIENT_ID=$($benv['GMAIL_CLIENT_ID'])
GMAIL_CLIENT_SECRET=$($benv['GMAIL_CLIENT_SECRET'])
GMAIL_REFRESH_TOKEN=$($benv['GMAIL_REFRESH_TOKEN'])
GMAIL_SERVICE_ACCOUNT_FILE=
GMAIL_IMPERSONATE=

VERIFICATION_CODE_TTL_MIN=15
VERIFICATION_MAX_ATTEMPTS=5
VERIFICATION_RESEND_COOLDOWN_SEC=60
SENTRY_DSN=
"@ | Set-Content -NoNewline -Encoding ascii $envFile

# ---- 4. Consistent DB snapshot ---------------------------------------------
Step "Snapshotting fdm_local.db (consistent even if servers are running)"
& $Py -c "import sqlite3; s=sqlite3.connect(r'D:/FDM/backend/fdm_local.db'); d=sqlite3.connect(r'$($dbSnap -replace '\\','/')'); s.backup(d); d.close(); s.close(); print('snapshot ok')"
if (-not (Test-Path $dbSnap)) { Die "db snapshot not created" }

# ---- 5. git archive (committed, no secrets/junk) ---------------------------
Step "Archiving $Branch source"
git -C $Repo archive --format=tar.gz -o $srcTgz $Branch
if (-not (Test-Path $srcTgz)) { Die "git archive failed" }

# ---- 6. Remote setup script -------------------------------------------------
$remote = @'
set -euo pipefail
echo "== remote: docker =="
if ! command -v docker >/dev/null 2>&1; then
  echo "installing docker..."
  curl -fsSL https://get.docker.com | sh
fi
docker --version
docker compose version >/dev/null 2>&1 || { echo "compose plugin missing"; exit 1; }

echo "== remote: unpack code -> /opt/fdm =="
rm -rf /opt/fdm && mkdir -p /opt/fdm
tar -xzf /tmp/fdm-src.tgz -C /opt/fdm
cp /tmp/fdm.env /opt/fdm/deploy/.env
chmod 600 /opt/fdm/deploy/.env

cd /opt/fdm/deploy
echo "== remote: build & start stack =="
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

echo "== remote: seed SQLite volume with snapshot =="
docker compose -f docker-compose.prod.yml stop api
docker compose -f docker-compose.prod.yml cp /tmp/fdm_prod_seed.db api:/data/fdm.db
docker compose -f docker-compose.prod.yml start api

echo "== remote: wait for API (init_db + uvicorn) =="
for i in $(seq 1 30); do
  code=$(docker compose -f docker-compose.prod.yml exec -T api \
         python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8000/health/ready').status)" 2>/dev/null || true)
  [ "$code" = "200" ] && { echo "API ready"; break; }
  sleep 2
done
echo "== remote: containers =="
docker compose -f docker-compose.prod.yml ps
echo "== remote: HTTPS check (Caddy ACME may take ~30s on first run) =="
for i in $(seq 1 20); do
  c=$(curl -s -o /dev/null -w "%{http_code}" "https://API_DOMAIN_PLACEHOLDER/health/ready" || true)
  echo "  https://API_DOMAIN_PLACEHOLDER/health/ready -> $c"
  [ "$c" = "200" ] && break
  sleep 5
done
shred -u /tmp/fdm.env /tmp/fdm_prod_seed.db 2>/dev/null || rm -f /tmp/fdm.env /tmp/fdm_prod_seed.db
echo "== remote: done =="
'@
$remote = $remote -replace 'API_DOMAIN_PLACEHOLDER', $ApiDomain
$remote = $remote -replace "`r`n", "`n"
Set-Content -NoNewline -Encoding ascii $remoteSh $remote

# ---- 7. Transfer + run ------------------------------------------------------
Step "Copying artifacts to $Target`:/tmp"
scp @SshOpts $srcTgz   "${Target}:/tmp/fdm-src.tgz"      ; if ($LASTEXITCODE) { Die "scp src" }
scp @SshOpts $envFile  "${Target}:/tmp/fdm.env"          ; if ($LASTEXITCODE) { Die "scp env" }
scp @SshOpts $dbSnap   "${Target}:/tmp/fdm_prod_seed.db" ; if ($LASTEXITCODE) { Die "scp db" }
scp @SshOpts $remoteSh "${Target}:/tmp/remote-setup.sh"  ; if ($LASTEXITCODE) { Die "scp setup" }

Step "Running remote setup (build can take a few minutes)"
ssh @SshOpts $Target "bash /tmp/remote-setup.sh"
if ($LASTEXITCODE) { Die "remote setup returned $LASTEXITCODE" }

# ---- 8. Local verification --------------------------------------------------
Step "Local verification"
try {
  $r = Invoke-WebRequest -UseBasicParsing "https://$ApiDomain/health/ready" -TimeoutSec 15
  Write-Host "  https://$ApiDomain/health/ready  -> $($r.StatusCode) $($r.Content)"
} catch { Write-Host "  API HTTPS not green yet: $($_.Exception.Message)" -ForegroundColor Yellow }
try {
  $a = Invoke-WebRequest -UseBasicParsing "https://$AdminDomain/" -TimeoutSec 15
  Write-Host "  https://$AdminDomain/             -> $($a.StatusCode)"
} catch { Write-Host "  Admin HTTPS not green yet: $($_.Exception.Message)" -ForegroundColor Yellow }

Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
Write-Host "`nDeploy finished." -ForegroundColor Green
Write-Host "  Admin : https://$AdminDomain"
Write-Host "  API   : https://$ApiDomain/health/ready"
Write-Host ""
Write-Host "Admin account: whatever the seeded SQLite snapshot already had."
Write-Host "To reset:  ssh $Target  docker compose -f /opt/fdm/deploy/docker-compose.prod.yml \"
Write-Host "             exec api python -m app.cli.seed_admin '<Name>' '<email>' '<new-password>'"
