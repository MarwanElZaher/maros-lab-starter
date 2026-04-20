#!/usr/bin/env bash
# Maro's LAB VPS pull-loop reconciler — list-driven, no inbound SSH required.
#
# Reads service definitions from CONFIG_FILE (default /etc/maroslab/pull-loop.conf).
# Each non-blank, non-comment line:   IMAGE|COMPOSE_FILE|SERVICE_NAME
#
# Example config line:
#   ghcr.io/marwanelzaher/maros-lab-starter:main|/home/marwanelzaher/ai-company/maros-lab-starter/docker-compose.prod.yml|app
#
# To add a new service for slice 3+, append a line to the config file —
# no changes to this script are needed.
#
# Managed by: systemd/maroslab-pull-loop.timer (OnCalendar=*:0/2)
# Install:    sudo bash scripts/install-pull-loop.sh
set -euo pipefail

CONFIG_FILE="${PULL_LOOP_CONFIG:-/etc/maroslab/pull-loop.conf}"
LOG_FILE="${PULL_LOOP_LOG:-/var/log/maroslab-pull-loop.log}"
MAX_LOG_BYTES=10485760  # 10 MB

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [pull-loop] $*" | tee -a "$LOG_FILE"; }

rotate_log() {
  local size
  size=$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
  if [[ $size -gt $MAX_LOG_BYTES ]]; then
    mv "$LOG_FILE" "${LOG_FILE}.1"
    log "log rotated (was ${size} bytes)"
  fi
}

if [[ ! -f "$CONFIG_FILE" ]]; then
  log "CONFIG NOT FOUND: $CONFIG_FILE — nothing to reconcile"
  exit 0
fi

rotate_log
log "starting reconcile (config: $CONFIG_FILE)"

while IFS='|' read -r image compose_file service_name || [[ -n "${image:-}" ]]; do
  # Strip whitespace; skip blank lines and comments
  image="${image#"${image%%[![:space:]]*}"}"
  image="${image%"${image##*[![:space:]]}"}"
  [[ -z "$image" || "$image" == \#* ]] && continue

  compose_file="${compose_file#"${compose_file%%[![:space:]]*}"}"
  compose_file="${compose_file%"${compose_file##*[![:space:]]}"}"
  service_name="${service_name#"${service_name%%[![:space:]]*}"}"
  service_name="${service_name%"${service_name##*[![:space:]]}"}"

  if [[ -z "$compose_file" || -z "$service_name" ]]; then
    log "SKIP malformed line: '$image|$compose_file|$service_name'"
    continue
  fi

  # ── 1. Pull image ──────────────────────────────────────────────────────────
  log "pull image=$image service=$service_name"
  if ! docker pull --quiet "$image" >> "$LOG_FILE" 2>&1; then
    log "ERROR: docker pull failed for $image — skipping service=$service_name"
    continue
  fi

  # ── 2. Resolve pulled digest ───────────────────────────────────────────────
  NEW_DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "$image" 2>/dev/null \
               || docker inspect --format='{{.Id}}' "$image" 2>/dev/null \
               || echo "")

  # ── 3. Resolve running container digest ───────────────────────────────────
  RUNNING_ID=$(docker compose -f "$compose_file" ps -q "$service_name" 2>/dev/null | head -1 || true)

  if [[ -n "$RUNNING_ID" ]]; then
    RUNNING_IMAGE=$(docker inspect --format='{{.Image}}' "$RUNNING_ID" 2>/dev/null || echo "")
    RUNNING_DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "$RUNNING_IMAGE" 2>/dev/null \
                     || docker inspect --format='{{.Id}}' "$RUNNING_IMAGE" 2>/dev/null \
                     || echo "")
  else
    RUNNING_DIGEST=""
  fi

  # ── 4. Reconcile ──────────────────────────────────────────────────────────
  if [[ -n "$NEW_DIGEST" && "$NEW_DIGEST" == "$RUNNING_DIGEST" ]]; then
    log "no-change service=$service_name digest=${NEW_DIGEST##*@}"
    continue
  fi

  if [[ -z "$RUNNING_DIGEST" ]]; then
    log "updated (starting fresh) service=$service_name new=${NEW_DIGEST##*@}"
  else
    log "updated service=$service_name old=${RUNNING_DIGEST##*@} new=${NEW_DIGEST##*@}"
  fi

  docker compose -f "$compose_file" up -d --pull never --force-recreate "$service_name" \
    >> "$LOG_FILE" 2>&1

  log "reconcile complete service=$service_name"

done < "$CONFIG_FILE"

log "done"
