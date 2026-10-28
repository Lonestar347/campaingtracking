#!/bin/sh
# Container start: create/upgrade the database schema, seed sample data on first run, start the app.
set -e
mkdir -p /data/uploads
DB_FILE="${DATABASE_URL#file:}"
FIRST_RUN=0
[ -f "$DB_FILE" ] || FIRST_RUN=1

npx prisma db push --skip-generate
if [ "$FIRST_RUN" = 1 ] && [ "${SEED_SAMPLE_DATA:-true}" = "true" ]; then
  echo "First start: loading sample data"
  npx prisma db seed
fi

exec npx next start -p "${PORT:-3000}"
