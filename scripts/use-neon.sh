#!/usr/bin/env bash
# Points the API at a Neon database.
#
# Put the connection string in a file, never in chat:
#   printf '%s' 'postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require' > ~/.neon-url
#   chmod 600 ~/.neon-url
#   bash scripts/use-neon.sh
#
# The URL is copied into apps/api/.env (git-ignored) and never echoed.
set -euo pipefail

URL_FILE="${1:-$HOME/.neon-url}"
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/apps/api/.env"

if [ ! -f "$URL_FILE" ]; then
  echo "Missing $URL_FILE" >&2
  echo "Write your Neon connection string there first (see the header of this script)." >&2
  exit 2
fi

URL="$(tr -d '\r\n' < "$URL_FILE")"

case "$URL" in
  postgresql://*|postgres://*) ;;
  *) echo "That does not look like a PostgreSQL URL." >&2; exit 3 ;;
esac

# Neon requires TLS. Accept a URL that says so, or add it.
case "$URL" in
  *sslmode=*) ;;
  *\?*) URL="$URL&sslmode=require" ;;
  *) URL="$URL?sslmode=require" ;;
esac

if grep -q '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null; then
  # Replace in place without printing the old or new value.
  TMP="$(mktemp)"
  awk -v url="$URL" '
    BEGIN { done = 0 }
    /^DATABASE_URL=/ && !done { print "DATABASE_URL=\"" url "\""; done = 1; next }
    { print }
  ' "$ENV_FILE" > "$TMP"
  mv "$TMP" "$ENV_FILE"
else
  printf 'DATABASE_URL="%s"\n' "$URL" >> "$ENV_FILE"
fi

echo "DATABASE_URL updated in apps/api/.env (value not printed)."
echo "Next:"
echo "  npm run db:migrate:deploy --workspace @mr/api"
echo "  npm run db:seed --workspace @mr/api"
