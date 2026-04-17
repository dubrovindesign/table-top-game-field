#!/usr/bin/env bash
# One-time install/upgrade for the TURN server used by Tornscape voice chat.
# Re-running is idempotent — it re-renders /etc/turnserver.conf from the
# template and restarts the service.
#
# Usage (as root on the VPS):
#   TURN_HOST=turn.dubrovindesign.ru \
#   TURN_REALM=dubrovindesign.ru \
#   TURN_USER=hexgame \
#   TURN_PASS='<strong random string, generate with: openssl rand -base64 24>' \
#   EXTERNAL_IP=$(curl -fsS https://ipv4.icanhazip.com) \
#   bash /var/www/hex-board-game/deploy/install-coturn.sh
#
# After success, write the creds for deploy.sh to pick up:
#   /etc/default/hex-turn.env   (see end of this script for the exact contents)
# then re-run deploy.sh so the client bundle is rebuilt with the new ICE list.
#
# DNS prereq: A-record turn.dubrovindesign.ru → this VPS's public IPv4.

set -euo pipefail

: "${TURN_HOST:?TURN_HOST required (e.g. turn.dubrovindesign.ru)}"
: "${TURN_REALM:?TURN_REALM required (e.g. dubrovindesign.ru)}"
: "${TURN_USER:?TURN_USER required}"
: "${TURN_PASS:?TURN_PASS required}"
: "${EXTERNAL_IP:?EXTERNAL_IP required (public IPv4 of this VPS)}"

REPO_DIR="${REPO_DIR:-/var/www/hex-board-game}"
TEMPLATE="$REPO_DIR/deploy/turnserver.conf.example"
TURN_ENV_FILE="${TURN_ENV_FILE:-/etc/default/hex-turn.env}"

if [ ! -r "$TEMPLATE" ]; then
    echo "Template not found: $TEMPLATE" >&2
    echo "Is REPO_DIR ($REPO_DIR) correct?" >&2
    exit 1
fi

echo "=== apt install coturn certbot ==="
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y coturn certbot

echo "=== obtain TLS cert for $TURN_HOST (certbot --standalone) ==="
# Caddy owns 80/443; release 80 briefly for the HTTP-01 challenge, then restore.
# If cert already exists and is valid, certbot no-ops without stopping Caddy.
if ! certbot certificates 2>/dev/null | grep -q "Domains:.* $TURN_HOST\( \|$\)"; then
    systemctl stop caddy
    trap 'systemctl start caddy' EXIT
    certbot certonly --standalone --non-interactive --agree-tos \
        -m "admin@${TURN_REALM}" -d "$TURN_HOST"
    systemctl start caddy
    trap - EXIT
else
    echo "Cert for $TURN_HOST already present — skipping issuance."
fi

echo "=== render /etc/turnserver.conf ==="
install -m 0644 "$TEMPLATE" /etc/turnserver.conf
sed -i \
    -e "s|REPLACE_REALM|${TURN_REALM}|g" \
    -e "s|REPLACE_EXTERNAL_IP|${EXTERNAL_IP}|g" \
    -e "s|REPLACE_TURN_USER|${TURN_USER}|g" \
    -e "s|REPLACE_TURN_PASS|${TURN_PASS}|g" \
    -e "s|REPLACE_TURN_HOST|${TURN_HOST}|g" \
    /etc/turnserver.conf

# coturn runs as user `turnserver`; it needs read on the LE private key.
if getent group ssl-cert >/dev/null && id turnserver >/dev/null 2>&1; then
    usermod -aG ssl-cert turnserver || true
fi
# LE default perms on archive/ are 700 root — widen enough for ssl-cert group.
chmod 755 /etc/letsencrypt/live /etc/letsencrypt/archive 2>/dev/null || true
if [ -f "/etc/letsencrypt/live/$TURN_HOST/privkey.pem" ]; then
    chgrp ssl-cert "/etc/letsencrypt/live/$TURN_HOST/privkey.pem" 2>/dev/null || true
    chmod 640 "/etc/letsencrypt/live/$TURN_HOST/privkey.pem" 2>/dev/null || true
    # chgrp on the symlink target too (LE stores real files under archive/).
    REAL_KEY=$(readlink -f "/etc/letsencrypt/live/$TURN_HOST/privkey.pem")
    chgrp ssl-cert "$REAL_KEY" 2>/dev/null || true
    chmod 640 "$REAL_KEY" 2>/dev/null || true
fi

# LE renewal hook: restart coturn after each successful renewal so the new
# cert is picked up. coturn doesn't hot-reload TLS material reliably.
HOOK_DIR=/etc/letsencrypt/renewal-hooks/deploy
mkdir -p "$HOOK_DIR"
cat > "$HOOK_DIR/coturn.sh" <<'HOOK'
#!/usr/bin/env bash
# Restart coturn when any LE cert it uses gets renewed.
# RENEWED_LINEAGE is set by certbot; bail if the renewal is for a different domain.
set -eu
case "${RENEWED_LINEAGE:-}" in
    */turn.*) systemctl restart coturn ;;
esac
HOOK
chmod +x "$HOOK_DIR/coturn.sh"

echo "=== enable coturn daemon ==="
# Debian/Ubuntu gate the service on this env flag.
if [ -f /etc/default/coturn ]; then
    sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
    grep -q '^TURNSERVER_ENABLED=1' /etc/default/coturn \
        || echo 'TURNSERVER_ENABLED=1' >> /etc/default/coturn
fi
systemctl enable coturn >/dev/null
systemctl restart coturn
sleep 1
if ! systemctl is-active --quiet coturn; then
    echo "coturn failed to start — check 'journalctl -u coturn -n 50'" >&2
    exit 1
fi
echo "coturn: active"

echo "=== firewall (ufw, no-op if not installed) ==="
if command -v ufw >/dev/null; then
    ufw allow 3478/udp >/dev/null
    ufw allow 3478/tcp >/dev/null
    ufw allow 5349/tcp >/dev/null
    ufw allow 49160:49200/udp >/dev/null
    echo "ufw: opened 3478/udp, 3478/tcp, 5349/tcp, 49160-49200/udp"
fi

# Hint file for deploy.sh. deploy.sh sources this, then bakes VITE_RTC_ICE_SERVERS
# into the client bundle at `npm run build`.
cat > "$TURN_ENV_FILE" <<EOF
# Written by deploy/install-coturn.sh. Sourced by deploy/deploy.sh.
# The client bundle exposes these creds publicly — they gate drive-by abuse only.
VITE_RTC_ICE_SERVERS='[{"urls":["stun:${TURN_HOST}:3478"]},{"urls":["turn:${TURN_HOST}:3478?transport=udp","turn:${TURN_HOST}:3478?transport=tcp"],"username":"${TURN_USER}","credential":"${TURN_PASS}"},{"urls":"turns:${TURN_HOST}:5349?transport=tcp","username":"${TURN_USER}","credential":"${TURN_PASS}"}]'
EOF
chmod 640 "$TURN_ENV_FILE"

echo
echo "TURN running on $TURN_HOST"
echo "  plain:  turn:$TURN_HOST:3478  (UDP preferred, TCP fallback)"
echo "  TLS:    turns:$TURN_HOST:5349?transport=tcp"
echo "  creds:  $TURN_USER / (see $TURN_ENV_FILE)"
echo
echo "Next step: re-run deploy.sh so the client bundle picks up VITE_RTC_ICE_SERVERS."
echo "  bash $REPO_DIR/deploy/deploy.sh"
echo
echo "Verify end-to-end: open chrome://webrtc-internals during a 2-player session,"
echo "check the selected ICE candidate pair — at least one side should be type=relay"
echo "for cross-network calls to prove TURN is actually relaying."
