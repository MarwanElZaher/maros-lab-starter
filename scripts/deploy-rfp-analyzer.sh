#!/usr/bin/env bash
# Run this ON THE VPS as marwanelzaher to deploy/update the rfp-analyzer container.
# Usage: bash scripts/deploy-rfp-analyzer.sh
set -euo pipefail

REPO_DIR="/home/marwanelzaher/ai-company/maros-lab-starter"
ENV_FILE="$REPO_DIR/docker/.env.rfp-analyzer"

cd "$REPO_DIR"

# Pull latest code
git pull origin main

# Write env file if it doesn't exist (fill in the two API keys once)
if [ ! -f "$ENV_FILE" ]; then
  echo "Creating $ENV_FILE — you will be prompted for the two API keys."
  read -rsp "OPENROUTER_API_KEY: " OPENROUTER_API_KEY; echo
  read -rsp "RAGFLOW_API_KEY: "    RAGFLOW_API_KEY;    echo
  cat > "$ENV_FILE" <<EOF
OPENROUTER_API_KEY=$OPENROUTER_API_KEY
OPENROUTER_MODEL=anthropic/claude-haiku-4-5
RAGFLOW_BASE_URL=https://ragflow.marwanelzaher.info
RAGFLOW_API_KEY=$RAGFLOW_API_KEY
RAGFLOW_DATASET_PRODUCTS=ab0dfc483bfb11f18e37b14efee78710
RAGFLOW_DATASET_PRICING=abe9de203bfb11f18e37b14efee78710
RAGFLOW_DATASET_PAST_BIDS=aca85a8a3bfb11f18e37b14efee78710
EOF
  chmod 600 "$ENV_FILE"
  echo "Env file written."
else
  # Ensure dataset IDs are up-to-date even if the file already exists
  echo "Patching dataset IDs in existing $ENV_FILE …"
  sed -i 's|^RAGFLOW_DATASET_PRODUCTS=.*|RAGFLOW_DATASET_PRODUCTS=ab0dfc483bfb11f18e37b14efee78710|' "$ENV_FILE"
  sed -i 's|^RAGFLOW_DATASET_PRICING=.*|RAGFLOW_DATASET_PRICING=abe9de203bfb11f18e37b14efee78710|'   "$ENV_FILE"
  sed -i 's|^RAGFLOW_DATASET_PAST_BIDS=.*|RAGFLOW_DATASET_PAST_BIDS=aca85a8a3bfb11f18e37b14efee78710|' "$ENV_FILE"
  # Add missing keys if not present
  grep -q 'RAGFLOW_DATASET_PRODUCTS'  "$ENV_FILE" || echo 'RAGFLOW_DATASET_PRODUCTS=ab0dfc483bfb11f18e37b14efee78710'  >> "$ENV_FILE"
  grep -q 'RAGFLOW_DATASET_PRICING'   "$ENV_FILE" || echo 'RAGFLOW_DATASET_PRICING=abe9de203bfb11f18e37b14efee78710'   >> "$ENV_FILE"
  grep -q 'RAGFLOW_DATASET_PAST_BIDS' "$ENV_FILE" || echo 'RAGFLOW_DATASET_PAST_BIDS=aca85a8a3bfb11f18e37b14efee78710' >> "$ENV_FILE"
  echo "Dataset IDs patched."
fi

# (Re)start the container
docker compose -f "$REPO_DIR/docker/docker-compose.rfp-analyzer.yml" \
  --env-file "$ENV_FILE" \
  up -d --build --force-recreate

echo ""
echo "Waiting 30s for healthcheck …"
sleep 30

docker ps --filter name=rfp-analyzer --format "table {{.Names}}\t{{.Status}}"
