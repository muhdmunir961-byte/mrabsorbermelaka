#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY_FILE="$ROOT_DIR/.neon-api-key"

if [[ ! -f "$KEY_FILE" ]]; then
  printf 'Create %s, paste one Neon API key into it, then run this script again.\n' "$KEY_FILE" >&2
  exit 1
fi

NEON_API_KEY="$(tr -d '\r\n' < "$KEY_FILE")"
if [[ -z "$NEON_API_KEY" ]]; then
  printf '%s is empty. Paste one Neon API key into it.\n' "$KEY_FILE" >&2
  exit 1
fi

export NEON_API_KEY

cd "$ROOT_DIR"
npx -y neon@latest deploy
npm run build

unset NEON_API_KEY
printf 'Neon deploy and application build completed.\n'