#!/usr/bin/env bash
# VPS pull-loop reconciler for the CopilotKit service (MAR-23).
#
# Polls GHCR for a new image digest; if it differs from the running container,
# pulls the new image and restarts the copilotkit compose service.
#
# Controlled by environment variables (set in /etc/default/copilotkit-reconciler):
#   COPILOTKIT_IMAGE   — full GHCR image ref with tag (required)
#   COMPOSE_FILE       — path to the docker-compose file for the copilotkit service
#   COMPOSE_SERVICE    — compose service name (default: copilotkit)
#   LOG_TAG            — syslog tag / prefix (default: copilotkit-reconciler)
#
# Run as: bash infra/copilotkit-reconciler.sh
# Managed by: infra/copilotkit-reconciler.timer (systemd, every 2 min)
set -euo pipefail

: "${COPILOTKIT_IMAGE:?COPILOTKIT_IMAGE must be set (e.g. ghcr.io/marwanelzaher/maros-lab-starter-copilotkit:latest)}"
: "${COMPOSE_FILE:=/home/marwanelzaher/ai-company/copilotkit/docker-compose.yml}"
: "${COMPOSE_SERVICE:=copilotkit}"
: "${LOG_TAG:=copilotkit-reconciler}"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [$LOG_TAG] $*"; }

# ── 1. Pull image (updates local manifest + layers) ───────────────────────────
log "pulling $COPILOTKIT_IMAGE"
docker pull --quiet "$COPILOTKIT_IMAGE"

# ── 2. Get the digest of the just-pulled image ────────────────────────────────
NEW_DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "$COPILOTKIT_IMAGE" 2>/dev/null || true)
if [[ -z "$NEW_DIGEST" ]]; then
  # Fallback: use image ID when no repo digest is available (local build)
  NEW_DIGEST=$(docker inspect --format='{{.Id}}' "$COPILOTKIT_IMAGE")
fi

# ── 3. Get the digest of the currently running container ─────────────────────
RUNNING_ID=$(docker compose -f "$COMPOSE_FILE" ps -q "$COMPOSE_SERVICE" 2>/dev/null | head -1 || true)

if [[ -n "$RUNNING_ID" ]]; then
  RUNNING_DIGEST=$(docker inspect --format='{{index .Image}}' "$RUNNING_ID" 2>/dev/null || true)
  # Resolve short image ID to full digest for comparison
  RUNNING_DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "$RUNNING_DIGEST" 2>/dev/null \
                   || docker inspect --format='{{.Id}}' "$RUNNING_DIGEST" 2>/dev/null || true)
else
  RUNNING_DIGEST=""
fi

# ── 4. Compare and reconcile ─────────────────────────────────────────────────
if [[ "$NEW_DIGEST" == "$RUNNING_DIGEST" && -n "$RUNNING_DIGEST" ]]; then
  log "no-change digest=$NEW_DIGEST"
  exit 0
fi

if [[ -z "$RUNNING_DIGEST" ]]; then
  log "updated (container not running — starting) new=$NEW_DIGEST"
else
  log "updated old=$RUNNING_DIGEST new=$NEW_DIGEST"
fi

docker compose -f "$COMPOSE_FILE" up -d --pull never "$COMPOSE_SERVICE"

log "reconcile complete service=$COMPOSE_SERVICE"
