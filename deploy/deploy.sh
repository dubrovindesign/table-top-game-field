#!/usr/bin/env bash
# Update the live deployment on the VPS.
#
# Usage (from your workstation):
#   ssh tornscape 'bash /var/www/hex-board-game/deploy/deploy.sh'
#
# Override the WebSocket URL if the domain changes:
#   ssh tornscape 'VITE_MP_WS_URL=wss://new.example/__mp_ws bash /var/www/hex-board-game/deploy/deploy.sh'
#
# Force a rebuild without new commits (e.g. right after install-coturn.sh wrote
# /etc/default/hex-turn.env and you need the client bundle to pick up the new
# VITE_RTC_ICE_SERVERS):
#   ssh tornscape 'FORCE_BUILD=1 bash /var/www/hex-board-game/deploy/deploy.sh'

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/hex-board-game}"
APP_USER="${APP_USER:-www-data}"
SERVICE="${SERVICE:-hex-room-server}"
WS_URL="${VITE_MP_WS_URL:-wss://tornscape.dubrovindesign.ru/__mp_ws}"
# Avoid ~/.npm or /var/www/.npm as root (EACCES when running npm as www-data).
NPM_CACHE="${APP_DIR}/.npm-cache"

# Pull TURN/ICE config from a root-owned env file written by install-coturn.sh.
# Keeping creds out of the repo means rotating them is `edit + redeploy`, no commit.
TURN_ENV_FILE="${TURN_ENV_FILE:-/etc/default/hex-turn.env}"
if [ -z "${VITE_RTC_ICE_SERVERS:-}" ] && [ -r "$TURN_ENV_FILE" ]; then
    # shellcheck disable=SC1090
    . "$TURN_ENV_FILE"
fi

cd "$APP_DIR"
sudo -u "$APP_USER" mkdir -p "$NPM_CACHE"

OLD_REV=$(sudo -u "$APP_USER" git rev-parse HEAD)
sudo -u "$APP_USER" git fetch --quiet origin
# `dist/` is not tracked in Git (see README); if an old clone still had tracked
# dist files, reset them so `git pull` is not blocked. No-op when dist is untracked.
sudo -u "$APP_USER" git checkout -- dist/ 2>/dev/null || true
# Same: `npm run build` rewrites this file; it must not block the next pull.
sudo -u "$APP_USER" git checkout -- public/generated/catalog-data.json 2>/dev/null || true
sudo -u "$APP_USER" git pull --ff-only
NEW_REV=$(sudo -u "$APP_USER" git rev-parse HEAD)

FORCE_BUILD="${FORCE_BUILD:-0}"

if [ "$OLD_REV" = "$NEW_REV" ] && [ "$FORCE_BUILD" != "1" ]; then
    echo "Already up to date at ${NEW_REV:0:12}. Nothing to do. (Pass FORCE_BUILD=1 to rebuild anyway.)"
    exit 0
fi

if [ "$OLD_REV" = "$NEW_REV" ]; then
    echo "No git changes; FORCE_BUILD=1 — rebuilding client bundle only."
    CHANGED=""
else
    CHANGED=$(git diff --name-only "$OLD_REV" "$NEW_REV")
    echo "Changed files between ${OLD_REV:0:12} and ${NEW_REV:0:12}:"
    echo "$CHANGED" | sed 's/^/  /'
fi

need_install=0
need_restart=0
if echo "$CHANGED" | grep -qE '^(package\.json|package-lock\.json)$'; then
    need_install=1
    need_restart=1
fi
if echo "$CHANGED" | grep -qE '^server/'; then
    need_restart=1
fi

# Platform-specific native binaries (rolldown, lightningcss) may be missing if
# the committed lockfile was generated on a different OS. `npm install` (not
# `npm ci`) reconciles optional deps for the current platform without failing.
if [ "$need_install" = 1 ]; then
    echo "=== npm install ==="
    sudo -u "$APP_USER" env NODE_OPTIONS="--max-old-space-size=768" \
        NPM_CONFIG_CACHE="$NPM_CACHE" npm install --no-audit --no-fund
fi

echo "=== build (VITE_MP_WS_URL=$WS_URL, TURN=${VITE_RTC_ICE_SERVERS:+configured})"
sudo -u "$APP_USER" env NODE_OPTIONS="--max-old-space-size=768" \
    NPM_CONFIG_CACHE="$NPM_CACHE" \
    VITE_MP_WS_URL="$WS_URL" \
    VITE_RTC_ICE_SERVERS="${VITE_RTC_ICE_SERVERS:-}" \
    npm run build

if [ "$need_restart" = 1 ]; then
    echo "=== restart $SERVICE ==="
    systemctl restart "$SERVICE"
    systemctl is-active --quiet "$SERVICE" && echo "$SERVICE: active"
fi

echo
echo "Deployed ${NEW_REV:0:12}."
