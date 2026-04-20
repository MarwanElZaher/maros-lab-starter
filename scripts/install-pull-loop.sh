#!/usr/bin/env bash
# Install (or re-install) the Maro's LAB pull-loop systemd timer on the VPS.
# Run once as root from the repo root:
#   sudo bash scripts/install-pull-loop.sh
#
# Idempotent — safe to re-run after repo updates.
set -euo pipefail

REPO_DIR="/home/marwanelzaher/ai-company/maros-lab-starter"
SYSTEMD_DIR="/etc/systemd/system"
CONF_DIR="/etc/maroslab"
CONF_FILE="$CONF_DIR/pull-loop.conf"
LOG_FILE="/var/log/maroslab-pull-loop.log"

# ── 1. Ensure config directory and log file ────────────────────────────────
mkdir -p "$CONF_DIR"
touch "$LOG_FILE"
chown marwanelzaher:marwanelzaher "$LOG_FILE"

# ── 2. Write default config if not present ────────────────────────────────
if [[ ! -f "$CONF_FILE" ]]; then
  cp "$REPO_DIR/systemd/pull-loop.conf.example" "$CONF_FILE"
  echo ""
  echo "Created $CONF_FILE from example."
  echo "Edit it to set the correct IMAGE / COMPOSE_FILE / SERVICE_NAME for each service."
  echo ""
else
  echo "$CONF_FILE already exists — not overwriting."
fi

# ── 3. Make scripts executable ────────────────────────────────────────────
chmod +x "$REPO_DIR/scripts/pull-loop.sh"

# ── 4. Install systemd units ──────────────────────────────────────────────
cp "$REPO_DIR/systemd/maroslab-pull-loop.service" "$SYSTEMD_DIR/"
cp "$REPO_DIR/systemd/maroslab-pull-loop.timer"   "$SYSTEMD_DIR/"

systemctl daemon-reload
systemctl enable --now maroslab-pull-loop.timer

echo ""
echo "Timer installed and active. Verify with:"
echo "  systemctl status maroslab-pull-loop.timer"
echo "  journalctl -u maroslab-pull-loop.service -f"
echo "  tail -f /var/log/maroslab-pull-loop.log"
