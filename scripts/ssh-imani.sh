#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
HOST="${IMANI_HOST:-177.7.56.247}"
USER="${IMANI_USER:-root}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

PW_LINE="$(grep -E '^SERVER_PASSWORD=' "$ENV_FILE" || true)"
if [[ -z "$PW_LINE" ]]; then
  echo '.env must contain a line: SERVER_PASSWORD=your_ssh_password'
  exit 1
fi
PW="${PW_LINE#SERVER_PASSWORD=}"

if ! command -v sshpass &>/dev/null; then
  echo 'Install sshpass first (e.g. Debian/Ubuntu: sudo apt install sshpass ; macOS: brew install hudochenkov/sshpass/sshpass)'
  exit 1
fi

exec sshpass -p "${PW}" ssh \
  -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no \
  -o StrictHostKeyChecking=accept-new \
  "${USER}@${HOST}" \
  "$@"
