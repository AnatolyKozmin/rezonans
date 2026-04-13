#!/bin/sh
set -e
cd /app/apps/api
mkdir -p data uploads
export DATABASE_URL="${DATABASE_URL:-file:./data/db.sqlite}"
npx prisma db push --accept-data-loss
exec node dist/index.js
