#!/usr/bin/env bash
# MAR-63: Add / update acme-licensing and acme-user-guides dataset IDs in the main .env
# Run ON THE VPS as marwanelzaher:  bash scripts/patch-env-mar63.sh
set -euo pipefail

ENV_FILE="/home/marwanelzaher/ai-company/maros-lab-starter/.env"
COMPOSE_FILE="/home/marwanelzaher/ai-company/maros-lab-starter/docker-compose.prod.yml"

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
echo "Restarting app container ..."
docker compose -f "$COMPOSE_FILE" up -d --force-recreate app

echo ""
echo "Done. Verify with:"
echo "  docker compose -f $COMPOSE_FILE ps"
echo "  curl -sk https://\$(grep APP_HOST $ENV_FILE | cut -d= -f2)/admin/kb | head -5"
