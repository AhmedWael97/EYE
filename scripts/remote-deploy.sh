#!/usr/bin/env bash
#
# EYE — trigger a production deploy from your machine over SSH.
# One command instead of GitHub Actions:   ./scripts/remote-deploy.sh
#
# Config: copy scripts/.deploy.env.example → scripts/.deploy.env and fill it,
# or export VPS_HOST / VPS_USER / VPS_PATH (and optionally VPS_SSH_KEY, VPS_PORT).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$HERE/.deploy.env" ] && source "$HERE/.deploy.env"

: "${VPS_HOST:?Set VPS_HOST (server IP/hostname)}"
: "${VPS_USER:?Set VPS_USER (ssh user)}"
: "${VPS_PATH:?Set VPS_PATH (repo path on the server)}"

SSH_OPTS=(-p "${VPS_PORT:-22}" -o StrictHostKeyChecking=accept-new)
[ -n "${VPS_SSH_KEY:-}" ] && SSH_OPTS+=(-i "$VPS_SSH_KEY")

echo "==> Deploying EYE to ${VPS_USER}@${VPS_HOST}:${VPS_PATH}"
# Pull the freshest deploy.sh first, then run it (so logic updates apply too).
ssh "${SSH_OPTS[@]}" "${VPS_USER}@${VPS_HOST}" \
  "cd '${VPS_PATH}' && git pull --rebase --autostash origin main >/dev/null 2>&1 || true; bash scripts/deploy.sh"

echo "==> Done."
