#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COOLIFY_URL="${COOLIFY_URL:-http://43.134.91.79:8000}"
APPLICATION_UUID="${APPLICATION_UUID:-yx4rfdlwu6sejtwyfswmkebq}"
TOKEN_FILE="$ROOT_DIR/.coolify-token"

if [[ ! -f "$TOKEN_FILE" ]]; then
  printf 'Missing %s. Put a new Coolify API token in that file.\n' "$TOKEN_FILE" >&2
  exit 1
fi

COOLIFY_TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"
if [[ -z "$COOLIFY_TOKEN" ]]; then
  printf '%s is empty.\n' "$TOKEN_FILE" >&2
  exit 1
fi

read_env_value() {
  local name="$1"
  awk -F= -v key="$name" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "$ROOT_DIR/.env.local"
}

if [[ ! -f "$ROOT_DIR/.env.local" ]]; then
  printf 'Missing %s. Run the Neon deploy script first.\n' "$ROOT_DIR/.env.local" >&2
  exit 1
fi

DATABASE_URL="$(read_env_value DATABASE_URL)"
if [[ -z "$DATABASE_URL" ]]; then
  printf 'DATABASE_URL is missing from .env.local.\n' >&2
  exit 1
fi

SECRET_FILE="$ROOT_DIR/.coolify-generated-secrets"
if [[ ! -f "$SECRET_FILE" ]]; then
  umask 077
  {
    printf 'SESSION_SECRET=%s\n' "$(node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")"
    printf 'FIELD_ENCRYPTION_KEY=%s\n' "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
    printf 'FIELD_INDEX_KEY=%s\n' "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
  } > "$SECRET_FILE"
fi

read_secret() {
  local name="$1"
  awk -F= -v key="$name" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "$SECRET_FILE"
}

API_URL="$COOLIFY_URL/api/v1/applications/$APPLICATION_UUID/envs"
ENV_LIST="$(curl --fail-with-body --silent --show-error \
  --request GET "$API_URL" \
  --header "Authorization: Bearer $COOLIFY_TOKEN")"

post_env() {
  local key="$1"
  local value="$2"
  local uuid
  uuid="$(node -e 'const rows = JSON.parse(process.argv[1]); const key = process.argv[2]; const row = rows.find((item) => item.key === key && item.is_preview === false); if (row) process.stdout.write(row.uuid);' "$ENV_LIST" "$key")"
  if [[ -n "$uuid" ]]; then
    curl --fail-with-body --silent --show-error \
      --request DELETE "$API_URL/$uuid" \
      --header "Authorization: Bearer $COOLIFY_TOKEN" \
      >/dev/null
  fi
  curl --fail-with-body --silent --show-error \
    --request POST "$API_URL" \
    --header "Authorization: Bearer $COOLIFY_TOKEN" \
    --header 'Content-Type: application/json' \
    --data "$(node -e 'const [key, value] = process.argv.slice(1); process.stdout.write(JSON.stringify({key, value, is_preview: false}))' "$key" "$value")" \
    >/dev/null
}

post_env DATABASE_URL "$DATABASE_URL"
post_env SESSION_SECRET "$(read_secret SESSION_SECRET)"
post_env FIELD_ENCRYPTION_KEY "$(read_secret FIELD_ENCRYPTION_KEY)"
post_env FIELD_INDEX_KEY "$(read_secret FIELD_INDEX_KEY)"
post_env CORS_ORIGIN 'https://mrabsorbermelaka.biz.id'
post_env NODE_ENV production
post_env API_HOST 0.0.0.0
post_env API_PORT 4000
post_env UPLOAD_DIR /data/uploads
post_env OTP_EXPOSE_DEV_CODE false

unset COOLIFY_TOKEN DATABASE_URL
printf 'Coolify environment variables sent for application %s.\n' "$APPLICATION_UUID"
printf 'Redeploy the application in Coolify after this script completes.\n'