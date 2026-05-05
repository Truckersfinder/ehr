#!/usr/bin/env bash
#
# Sync this repo to the VPS and run production install + build.
# Reads SERVER_PASSWORD from .env (same as scripts/ssh-imani.sh).
#
# Usage (from repo root):
#   ./scripts/deploy-imani.sh
#
# Env overrides:
#   IMANI_HOST=177.7.56.247 IMANI_USER=root ./scripts/deploy-imani.sh
#
# Push DATABASE_URL from this machine's .env to the server (e.g. Neon), then
# db:push + restart (server .env is still never rsync'd; this is an explicit override):
#   IMANI_SYNC_DATABASE_URL=1 ./scripts/deploy-imani.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
HOST="${IMANI_HOST:-177.7.56.247}"
USER="${IMANI_USER:-root}"
REMOTE_DIR="${IMANI_REMOTE_DIR:-/root/ehr}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

PW_LINE="$(grep -E '^SERVER_PASSWORD=' "$ENV_FILE" || true)"
if [[ -z "$PW_LINE" ]]; then
  echo '.env must contain: SERVER_PASSWORD=...'
  exit 1
fi
PW="${PW_LINE#SERVER_PASSWORD=}"

if ! command -v sshpass &>/dev/null; then
  echo "Install sshpass (macOS: brew install hudochenkov/sshpass/sshpass)"
  exit 1
fi
if ! command -v rsync &>/dev/null; then
  echo "rsync not found"
  exit 1
fi

SSH_BASE=(ssh -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no)
RSYNC_SSH="sshpass -p ${PW} ssh -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no"

echo "==> rsync -> ${USER}@${HOST}:${REMOTE_DIR}/ (server .env is never overwritten; edit on the VPS)"
sshpass -p "${PW}" rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.tmp' \
  --exclude '.cursor' \
  --exclude 'uploads' \
  --exclude '.env' \
  --exclude '.env.*.local' \
  -e "${RSYNC_SSH}" \
  "${ROOT}/" \
  "${USER}@${HOST}:${REMOTE_DIR}/"

echo "==> remote: Node, npm ci, build, systemd"
sshpass -p "${PW}" "${SSH_BASE[@]}" "${USER}@${HOST}" bash -s -- "$REMOTE_DIR" <<'REMOTE_EOF'
set -euo pipefail
REMOTE_DIR="$1"
cd "$REMOTE_DIR"

if [[ ! -f .env ]] && [[ -f .env.example ]]; then
  echo "[remote] Creating .env from .env.example (set DATABASE_URL and secrets as needed)."
  cp .env.example .env
fi

export DEBIAN_FRONTEND=noninteractive

need_node=0
if ! command -v node >/dev/null 2>&1; then
  need_node=1
else
  major=$(node -p 'parseInt(process.versions.node,10)' 2>/dev/null || echo 0)
  if [[ "$major" -lt 20 ]]; then
    need_node=1
  fi
fi

if [[ "$need_node" -eq 1 ]]; then
  echo "[remote] Installing Node.js 22 (NodeSource)..."
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs build-essential python3
fi

echo "[remote] Node: $(node -v) npm: $(npm -v)"

# Production listens on all interfaces; adjust if you proxy behind Nginx.
if [[ -f .env ]]; then
  if grep -q 'helium' .env && grep -qi 'DATABASE_URL' .env; then
    echo "[remote] DATABASE_URL pointed at helium; provisioning local Postgres on this VPS." >&2
    apt-get install -y postgresql postgresql-contrib
    systemctl enable postgresql
    systemctl start postgresql
    if ! sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'ehr'" | grep -q 1; then
      sudo -u postgres psql -c "CREATE DATABASE ehr;"
    fi
    sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'password';" || true
    if grep -qE '^DATABASE_URL=' .env; then
      sed -i 's|^DATABASE_URL=.*|DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/ehr?sslmode=disable|' .env
    else
      echo 'DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/ehr?sslmode=disable' >> .env
    fi
  fi
fi

if [[ -f .env ]]; then
  if ! grep -qE '^HOST=' .env; then echo 'HOST=0.0.0.0' >> .env; fi
  if ! grep -qE '^NODE_ENV=' .env; then echo 'NODE_ENV=production' >> .env; fi
  for var in SESSION_SECRET INTEGRATION_JWT_SECRET PATIENT_PORTAL_JWT_SECRET; do
    if ! grep -qE "^${var}=" .env; then
      echo "${var}=$(openssl rand -hex 32)" >> .env
    fi
  done
fi

npm ci
npm run db:push || true
npm run build

UNIT_SRC="$REMOTE_DIR/scripts/imani-ehr.service"
UNIT_DST="/etc/systemd/system/imani-ehr.service"
if [[ -f "$UNIT_SRC" ]]; then
  cp "$UNIT_SRC" "$UNIT_DST"
  sed -i "s|^WorkingDirectory=.*|WorkingDirectory=$REMOTE_DIR|" "$UNIT_DST"
  sed -i "s|^EnvironmentFile=.*|EnvironmentFile=-$REMOTE_DIR/.env|" "$UNIT_DST"
  systemd-analyze verify imani-ehr.service 2>/dev/null || true
  systemctl daemon-reload
  systemctl enable imani-ehr.service
  systemctl restart imani-ehr.service
  sleep 2
  systemctl --no-pager -l status imani-ehr.service || true
else
  echo "[remote] No systemd unit; starting with nohup (fallback)."
  (fuser -k 3000/tcp 2>/dev/null || true)
  mkdir -p /tmp
  cd "$REMOTE_DIR"
  HOST=0.0.0.0 NODE_ENV=production nohup npm start >/tmp/imani-ehr.log 2>&1 &
  sleep 2
  curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000/ || echo "curl failed (check DATABASE_URL / logs)"
fi

echo "[remote] Done. Logs: journalctl -u imani-ehr -f   or   tail -f /tmp/imani-ehr.log"
REMOTE_EOF

sync_db_url_to_remote() {
  local db_line db_val tmpf
  db_line="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 || true)"
  if [[ -z "$db_line" ]]; then
    echo "IMANI_SYNC_DATABASE_URL is set but $ENV_FILE has no DATABASE_URL= line" >&2
    return 1
  fi
  db_val="${db_line#DATABASE_URL=}"
  tmpf="$(mktemp)"
  printf '%s' "$db_val" >"$tmpf"
  chmod 600 "$tmpf"
  sshpass -p "${PW}" scp -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no \
    "$tmpf" "${USER}@${HOST}:/tmp/imani_sync_db_url"
  rm -f "$tmpf"
  sshpass -p "${PW}" "${SSH_BASE[@]}" "${USER}@${HOST}" bash -s -- "$REMOTE_DIR" <<'SYNC_DB_EOF'
set -euo pipefail
REMOTE_DIR="$1"
ENV_PATH="${REMOTE_DIR}/.env"
if [[ ! -f "$ENV_PATH" ]]; then
  echo "[remote] Missing $ENV_PATH; cannot sync DATABASE_URL" >&2
  exit 1
fi
grep -vE '^DATABASE_URL=' "$ENV_PATH" >"${ENV_PATH}.tmp$$" || true
mv "${ENV_PATH}.tmp$$" "$ENV_PATH"
{
  printf 'DATABASE_URL='
  cat /tmp/imani_sync_db_url
  printf '\n'
} >>"$ENV_PATH"
rm -f /tmp/imani_sync_db_url
chmod 600 "$ENV_PATH"
cd "$REMOTE_DIR"
npm run db:push
systemctl restart imani-ehr.service
echo "[remote] DATABASE_URL updated from local .env; db:push + imani-ehr restarted"
SYNC_DB_EOF
}

if [[ "${IMANI_SYNC_DATABASE_URL:-}" =~ ^(1|true|yes)$ ]]; then
  echo "==> Syncing DATABASE_URL from local $ENV_FILE to ${USER}@${HOST}:${REMOTE_DIR}/.env"
  sync_db_url_to_remote
fi

echo "==> Finished deploy to ${HOST}"
echo "HTTPS (after DNS points here): IMANI_CERTBOT_EMAIL=you@company.com ./scripts/provision-imani-https.sh"
if [[ ! "${IMANI_SYNC_DATABASE_URL:-}" =~ ^(1|true|yes)$ ]]; then
  echo "Neon / external DB: IMANI_SYNC_DATABASE_URL=1 ./scripts/deploy-imani.sh"
fi
