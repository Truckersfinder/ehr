#!/usr/bin/env bash
#
# On the VPS: Nginx reverse proxy → Node (port 3000), Let's Encrypt HTTPS.
#
# BEFORE YOU RUN:
#   1. Point DNS A record for imaniehr.com to this server’s public IP.
#   2. Optional: www → same host (A or CNAME). If you skip www, run with IMANI_SKIP_WWW=1.
#   3. Open TCP 80 and 443 on the VPS firewall / cloud security group.
#
# From repo root on your laptop:
#   IMANI_CERTBOT_EMAIL=you@yourdomain.com ./scripts/provision-imani-https.sh
#
# Optional:
#   IMANI_DOMAIN=imaniehr.com
#   IMANI_SKIP_WWW=1     # cert + nginx apex only (no www)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ENV="$ROOT/.env"
HOST="${IMANI_HOST:-177.7.56.247}"
USER="${IMANI_USER:-root}"
REMOTE_DIR="${IMANI_REMOTE_DIR:-/root/ehr}"
DOMAIN="${IMANI_DOMAIN:-imaniehr.com}"
CERT_EMAIL="${IMANI_CERTBOT_EMAIL:-}"
SKIP_WWW="${IMANI_SKIP_WWW:-0}"

if [[ -z "${CERT_EMAIL}" ]]; then
  echo "Set IMANI_CERTBOT_EMAIL=user@yourdomain.com (Let's Encrypt account / expiry notices)."
  exit 1
fi
if [[ ! "${CERT_EMAIL}" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
  echo "IMANI_CERTBOT_EMAIL does not look like a valid email."
  exit 1
fi

if [[ ! -f "$LOCAL_ENV" ]]; then
  echo "Missing $LOCAL_ENV (needs SERVER_PASSWORD for SSH)"
  exit 1
fi
PW_LINE="$(grep -E '^SERVER_PASSWORD=' "$LOCAL_ENV" || true)"
if [[ -z "$PW_LINE" ]]; then
  echo ".env must define SERVER_PASSWORD= for SSH."
  exit 1
fi
PW="${PW_LINE#SERVER_PASSWORD=}"

if ! command -v sshpass &>/dev/null; then
  echo "Install sshpass (same as deploy-imani.sh)."
  exit 1
fi

SSH_OPTS=(ssh -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no)
CONF_NAME="imaniehr"
REMOTE_CONF="/etc/nginx/sites-available/${CONF_NAME}"

echo "==> Provisioning HTTPS for https://${DOMAIN} on ${USER}@${HOST} (SKIP_WWW=${SKIP_WWW})"

sshpass -p "${PW}" rsync -az "${ROOT}/scripts/nginx-imaniehr.conf" "${USER}@${HOST}:/tmp/nginx-imaniehr.conf"

sshpass -p "${PW}" "${SSH_OPTS[@]}" "${USER}@${HOST}" \
  bash -s -- "$DOMAIN" "$CERT_EMAIL" "$REMOTE_DIR" "$REMOTE_CONF" "$SKIP_WWW" <<'REMOTE_EOF'
set -euo pipefail
DOMAIN="$1"
CERT_EMAIL="$2"
REMOTE_DIR="$3"
REMOTE_CONF="$4"
SKIP_WWW="$5"
CONF_NAME="imaniehr"
export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx

mkdir -p /var/www/certbot

if [[ "$SKIP_WWW" == "1" ]]; then
  sed -i "s/server_name .*;/server_name ${DOMAIN};/g" /tmp/nginx-imaniehr.conf
else
  sed -i "s/server_name .*;/server_name ${DOMAIN} www.${DOMAIN};/g" /tmp/nginx-imaniehr.conf
fi

install -m 0644 /tmp/nginx-imaniehr.conf "$REMOTE_CONF"
ln -sf "$REMOTE_CONF" "/etc/nginx/sites-enabled/${CONF_NAME}"
rm -f /etc/nginx/sites-enabled/default || true

nginx -t
systemctl enable nginx
systemctl reload nginx

if [[ "$SKIP_WWW" == "1" ]]; then
  certbot --nginx \
    -d "${DOMAIN}" \
    --non-interactive --agree-tos \
    --email "${CERT_EMAIL}" \
    --redirect
else
  certbot --nginx \
    -d "${DOMAIN}" -d "www.${DOMAIN}" \
    --non-interactive --agree-tos \
    --email "${CERT_EMAIL}" \
    --redirect
fi

systemctl reload nginx

ENV_TARGET="${REMOTE_DIR}/.env"
if [[ -f "$ENV_TARGET" ]]; then
  bump_kv() {
    local k="$1"
    local v="$2"
    grep -vE "^${k}=" "$ENV_TARGET" >"${ENV_TARGET}.tmp$$" || true
    mv "${ENV_TARGET}.tmp$$" "$ENV_TARGET"
    printf '%s=%s\n' "$k" "$v" >> "$ENV_TARGET"
  }
  bump_kv HOST 127.0.0.1
  bump_kv TRUST_PROXY 1
  bump_kv PATIENT_PORTAL_BASE_URL "https://${DOMAIN}"
  bump_kv PUBLIC_APP_URL "https://${DOMAIN}"
fi

systemctl restart imani-ehr.service || true

echo "[remote] curl -sS -I https://${DOMAIN}/ | head -n1"
REMOTE_EOF

echo "==> Done. Use https://${DOMAIN}"
echo "    Renewals: certbot renew (systemd timer is usually installed by certbot)"
