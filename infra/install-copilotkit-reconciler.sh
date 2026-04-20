#!/usr/bin/env bash
# Install the CopilotKit pull-loop reconciler as a systemd timer on the VPS.
# Run once as root (or with sudo) from the repo root:
#   sudo bash infra/install-copilotkit-reconciler.sh
#
# Pre-requisites:
#   - /etc/default/copilotkit-reconciler must exist with COPILOTKIT_IMAGE set
#   - The copilotkit docker-compose file must exist at COMPOSE_FILE
set -euo pipefail

REPO_DIR="/home/marwanelzaher/ai-company/maros-lab-starter"
INFRA_DIR="$REPO_DIR/infra"
SYSTEMD_DIR="/etc/systemd/system"
ENV_FILE="/etc/default/copilotkit-reconciler"

# ── 1. Write env file if not present ──────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<'EOF'
# Required: full GHCR image ref (lowercase) with tag
COPILOTKIT_IMAGE=ghcr.io/marwanelzaher/maros-lab-starter-copilotkit:latest

# Path to the copilotkit docker-compose file
COMPOSE_FILE=/home/marwanelzaher/ai-company/copilotkit/docker-compose.yml

# Compose service name inside that file
COMPOSE_SERVICE=copilotkit
EOF
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE — edit COPILOTKIT_IMAGE before the timer fires."
else
  echo "$ENV_FILE already exists — skipping."
fi

# ── 2. Make reconciler script executable ──────────────────────────────────────
chmod +x "$INFRA_DIR/copilotkit-reconciler.sh"

# ── 3. Install systemd units ──────────────────────────────────────────────────
cp "$INFRA_DIR/copilotkit-reconciler.service" "$SYSTEMD_DIR/"
cp "$INFRA_DIR/copilotkit-reconciler.timer"   "$SYSTEMD_DIR/"

systemctl daemon-reload
systemctl enable --now copilotkit-reconciler.timer

echo ""
echo "Timer installed. Check status with:"
echo "  systemctl status copilotkit-reconciler.timer"
echo "  journalctl -u copilotkit-reconciler.service -f"
