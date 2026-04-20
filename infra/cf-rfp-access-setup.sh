#!/usr/bin/env bash
# Cloudflare Access + Tunnel DNS setup for rfp.marwanelzaher.info (MAR-24)
#
# What this script does:
#   1. Adds a DNS CNAME for rfp.marwanelzaher.info pointing to the shared tunnel
#   2. Creates a CF Access application protecting that hostname
#   3. Creates presales-engineer and sales-director access policies
#   4. Prints the JWT audience tag the RBAC middleware needs (CF_ACCESS_AUD)
#
# Prerequisites:
#   - cloudflared installed and authenticated (tunnel credentials on VPS)
#   - CF_API_TOKEN  — Cloudflare API token with permissions:
#       Zone:DNS:Edit, Zero Trust:Access:Edit
#   - CF_ACCOUNT_ID — Cloudflare account ID
#   - CF_ZONE_ID    — Zone ID for marwanelzaher.info
#
# Run once from the VPS:
#   chmod +x infra/cf-rfp-access-setup.sh
#   CF_API_TOKEN=... CF_ACCOUNT_ID=... CF_ZONE_ID=... \
#     PRESALES_EMAILS="alice@example.com,bob@example.com,carol@example.com" \
#     DIRECTOR_EMAILS="dave@example.com,eve@example.com,frank@example.com" \
#     bash infra/cf-rfp-access-setup.sh

set -euo pipefail

TUNNEL_ID="7fbd32a4-92ea-4fd7-ab12-fd08f7d4b6f7"
HOSTNAME="rfp.marwanelzaher.info"
APP_NAME="RFP Analyzer"
CF_BASE="https://api.cloudflare.com/client/v4"

: "${CF_API_TOKEN:?Set CF_API_TOKEN}"
: "${CF_ACCOUNT_ID:?Set CF_ACCOUNT_ID}"
: "${CF_ZONE_ID:?Set CF_ZONE_ID}"
: "${PRESALES_EMAILS:?Set PRESALES_EMAILS as comma-separated list}"
: "${DIRECTOR_EMAILS:?Set DIRECTOR_EMAILS as comma-separated list}"

AUTH=(-H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json")

log() { echo "[cf-rfp-setup] $*"; }

# ── 1. Add DNS route for the hostname to the shared tunnel ────────────────────
# Set SKIP_DNS=1 if the DNS CNAME + tunnel ingress are already live.
if [[ "${SKIP_DNS:-0}" == "1" ]]; then
  log "SKIP_DNS=1 — skipping tunnel route dns (already configured)"
else
  log "Adding DNS route ${HOSTNAME} → tunnel ${TUNNEL_ID}"
  cloudflared tunnel route dns "${TUNNEL_ID}" "${HOSTNAME}"
fi

# ── 2. Create the CF Access application ───────────────────────────────────────
log "Creating CF Access application for ${HOSTNAME}"
APP_PAYLOAD=$(cat <<JSON
{
  "name": "${APP_NAME}",
  "domain": "${HOSTNAME}",
  "type": "self_hosted",
  "session_duration": "24h",
  "auto_redirect_to_identity": true,
  "http_only_cookie_attribute": true,
  "allow_authenticate_via_warp": false
}
JSON
)

APP_RESPONSE=$(curl -s -X POST \
  "${CF_BASE}/accounts/${CF_ACCOUNT_ID}/access/apps" \
  "${AUTH[@]}" \
  -d "${APP_PAYLOAD}")

AUD=$(echo "${APP_RESPONSE}" | grep -o '"aud":"[^"]*"' | head -1 | cut -d'"' -f4)
APP_ID=$(echo "${APP_RESPONSE}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [[ -z "${AUD}" || -z "${APP_ID}" ]]; then
  echo "ERROR: Failed to create Access application. Response:"
  echo "${APP_RESPONSE}"
  exit 1
fi

log "Access application created. id=${APP_ID}  aud=${AUD}"

# ── Helper: build email include rules from a comma-separated list ─────────────
build_email_rules() {
  local emails="$1"
  local rules="["
  local first=true
  IFS=',' read -ra LIST <<< "${emails}"
  for email in "${LIST[@]}"; do
    email=$(echo "${email}" | tr -d ' ')
    [[ "${first}" == true ]] && first=false || rules+=","
    rules+="{\"email\":{\"email\":\"${email}\"}}"
  done
  rules+="]"
  echo "${rules}"
}

# ── 3. presales-engineer policy ───────────────────────────────────────────────
log "Creating presales-engineer access policy"
PRESALES_RULES=$(build_email_rules "${PRESALES_EMAILS}")
PRESALES_PAYLOAD=$(cat <<JSON
{
  "name": "presales-engineer",
  "decision": "allow",
  "include": ${PRESALES_RULES},
  "exclude": [],
  "require": []
}
JSON
)
curl -s -X POST \
  "${CF_BASE}/accounts/${CF_ACCOUNT_ID}/access/apps/${APP_ID}/policies" \
  "${AUTH[@]}" \
  -d "${PRESALES_PAYLOAD}" | grep -q '"success":true' \
  && log "presales-engineer policy created" \
  || { echo "ERROR: Failed to create presales-engineer policy"; exit 1; }

# ── 4. sales-director policy ──────────────────────────────────────────────────
log "Creating sales-director access policy"
DIRECTOR_RULES=$(build_email_rules "${DIRECTOR_EMAILS}")
DIRECTOR_PAYLOAD=$(cat <<JSON
{
  "name": "sales-director",
  "decision": "allow",
  "include": ${DIRECTOR_RULES},
  "exclude": [],
  "require": []
}
JSON
)
curl -s -X POST \
  "${CF_BASE}/accounts/${CF_ACCOUNT_ID}/access/apps/${APP_ID}/policies" \
  "${AUTH[@]}" \
  -d "${DIRECTOR_PAYLOAD}" | grep -q '"success":true' \
  && log "sales-director policy created" \
  || { echo "ERROR: Failed to create sales-director policy"; exit 1; }

# ── 5. Print the audience tag ─────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo "  CF Access setup complete for ${HOSTNAME}"
echo ""
echo "  JWT Audience Tag (CF_ACCESS_AUD):"
echo "  ${AUD}"
echo ""
echo "  Add to /home/marwanelzaher/ai-company/copilotkit/.env:"
echo "  CF_ACCESS_AUD=${AUD}"
echo "  CF_ACCESS_TEAM_DOMAIN=marwanelzaher.cloudflareaccess.com"
echo "════════════════════════════════════════════════════════"
