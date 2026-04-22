#!/usr/bin/env bash
# MAR-63: Add / update acme-licensing and acme-user-guides dataset IDs in the main .env
# Run ON THE VPS as marwanelzaher:  bash scripts/patch-env-mar63.sh
# VPS layout: see docs/infra/vps-layout.md
set -euo pipefail

REPO_DIR="/home/marwanelzaher/ai-company/maros-lab-starter"
ENV_FILE="$REPO_DIR/docker/.env"
COMPOSE_FILE="$REPO_DIR/docker/docker-compose.copilotkit.yml"

LICENSING_ID="b8a9354c3e5911f19a41a18bf4de89c2"
USER_GUIDES_ID="b948c0083e5911f19a41a18bf4de89c2"

echo "Patching $ENV_FILE ..."

if grep -q '^RAGFLOW_DATASET_LICENSING=' "$ENV_FILE"; then
  sed -i "s|^RAGFLOW_DATASET_LICENSING=.*|RAGFLOW_DATASET_LICENSING=${LICENSING_ID}|" "$ENV_FILE"
else
  echo "RAGFLOW_DATASET_LICENSING=${LICENSING_ID}" >> "$ENV_FILE"
fi

if grep -q '^RAGFLOW_DATASET_USER_GUIDES=' "$ENV_FILE"; then
  sed -i "s|^RAGFLOW_DATASET_USER_GUIDES=.*|RAGFLOW_DATASET_USER_GUIDES=${USER_GUIDES_ID}|" "$ENV_FILE"
else
  echo "RAGFLOW_DATASET_USER_GUIDES=${USER_GUIDES_ID}" >> "$ENV_FILE"
fi

echo "Env vars written:"
grep 'RAGFLOW_DATASET_LICENSING\|RAGFLOW_DATASET_USER_GUIDES' "$ENV_FILE"

echo ""
echo "Restarting copilotkit container ..."
docker compose -f "$COMPOSE_FILE" up -d --force-recreate copilotkit

echo ""
echo "Done. Verify with:"
echo "  docker compose -f $COMPOSE_FILE ps"
echo "  curl -sk https://rfp.marwanelzaher.info | head -5"
