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
# Health alerting (optional):
#   PAPERCLIP_API_URL   — base URL of the Paperclip API
#   PAPERCLIP_API_KEY   — bearer token for Paperclip
#   PAPERCLIP_INFRA_ALERT_ISSUE — issue identifier or UUID to post alerts to (e.g. MAR-99)
#   UNHEALTHY_RESTART_THRESHOLD — RestartCount that triggers UNHEALTHY (default 2)
#   ALERT_COOLDOWN_SECONDS      — min seconds between Paperclip alerts per service (default 600)
#
# Managed by: systemd/maroslab-pull-loop.timer (OnCalendar=*:0/2)
# Install:    sudo bash scripts/install-pull-loop.sh
set -euo pipefail

CONFIG_FILE="${PULL_LOOP_CONFIG:-/etc/maroslab/pull-loop.conf}"
LOG_FILE="${PULL_LOOP_LOG:-/var/log/maroslab-pull-loop.log}"
MAX_LOG_BYTES=10485760  # 10 MB
UNHEALTHY_RESTART_THRESHOLD="${UNHEALTHY_RESTART_THRESHOLD:-2}"
ALERT_COOLDOWN_SECONDS="${ALERT_COOLDOWN_SECONDS:-600}"
STATE_DIR="${PULL_LOOP_STATE_DIR:-/var/lib/maroslab-pull-loop}"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [pull-loop] $*" | tee -a "$LOG_FILE"; }

rotate_log() {
  local size
  size=$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
  if [[ $size -gt $MAX_LOG_BYTES ]]; then
    mv "$LOG_FILE" "${LOG_FILE}.1"
    log "log rotated (was ${size} bytes)"
  fi
}

# Post a comment to the configured Paperclip infra-alerts issue.
# Silently skips if env vars are unset or the POST fails.
post_paperclip_alert() {
  local service_name="$1"
  local message="$2"

  [[ -z "${PAPERCLIP_API_URL:-}" || -z "${PAPERCLIP_API_KEY:-}" || -z "${PAPERCLIP_INFRA_ALERT_ISSUE:-}" ]] && return 0

  # Per-service cooldown: skip if we alerted less than ALERT_COOLDOWN_SECONDS ago.
  mkdir -p "$STATE_DIR"
  local stamp_file="$STATE_DIR/last-alert-$(echo "$service_name" | tr '/' '_').ts"
  local now
  now=$(date +%s)
  if [[ -f "$stamp_file" ]]; then
    local last_alert
    last_alert=$(cat "$stamp_file")
    if (( now - last_alert < ALERT_COOLDOWN_SECONDS )); then
      log "alert suppressed (cooldown) service=$service_name"
      return 0
    fi
  fi

  # Resolve issue UUID if an identifier like MAR-99 was given.
  local issue_url="$PAPERCLIP_API_URL/api/issues/$PAPERCLIP_INFRA_ALERT_ISSUE/comments"

  local payload
  payload=$(printf '{"body":"%s"}' "$(printf '%s' "$message" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/g' | tr -d '\n' | sed 's/\\n$//')")

  if curl -sf -X POST \
       -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
       -H "Content-Type: application/json" \
       -d "$payload" \
       "$issue_url" > /dev/null 2>&1; then
    echo "$now" > "$stamp_file"
    log "alert posted to Paperclip issue=$PAPERCLIP_INFRA_ALERT_ISSUE service=$service_name"
  else
    log "WARN: failed to post Paperclip alert for service=$service_name (non-fatal)"
  fi
}

# Check a running container for crash-loop symptoms and log/alert if found.
check_container_health() {
  local service_name="$1"
  local container_id="$2"

  local is_restarting restart_count
  is_restarting=$(docker inspect --format='{{.State.Restarting}}' "$container_id" 2>/dev/null || echo "false")
  restart_count=$(docker inspect --format='{{.RestartCount}}' "$container_id" 2>/dev/null || echo "0")

  if [[ "$is_restarting" == "true" && "$restart_count" -gt "$UNHEALTHY_RESTART_THRESHOLD" ]]; then
    log "UNHEALTHY service=$service_name container=$container_id restartCount=$restart_count — appending last 50 log lines"
    echo "--- container logs: $service_name ($container_id) ---" >> "$LOG_FILE"
    docker logs --tail 50 "$container_id" >> "$LOG_FILE" 2>&1 || true
    echo "--- end container logs ---" >> "$LOG_FILE"

    post_paperclip_alert "$service_name" \
      "UNHEALTHY: $service_name is crash-looping (restartCount=$restart_count). Check $LOG_FILE on VPS for container log tail."
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

  # ── 4. Health check (runs regardless of digest change) ────────────────────
  if [[ -n "$RUNNING_ID" ]]; then
    check_container_health "$service_name" "$RUNNING_ID"
  fi

  # ── 5. Reconcile ──────────────────────────────────────────────────────────
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
  # Clear any crash-loop alert cooldown after a successful redeploy.
  rm -f "$STATE_DIR/last-alert-$(echo "$service_name" | tr '/' '_').ts" 2>/dev/null || true

done < "$CONFIG_FILE"

log "done"
