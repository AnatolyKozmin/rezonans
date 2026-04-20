#!/bin/sh
set -e
cd /app/apps/api
mkdir -p data uploads
# По умолчанию — тот же путь, что в docker-compose (том ./apps/api/data → /app/apps/api/data).
export DATABASE_URL="${DATABASE_URL:-file:/app/apps/api/data/db.sqlite}"
# Без --accept-data-loss: при обычном рестарте схема не «съедает» данные SQLite в volume.
# Если push не проходит из‑за конфликта схемы — правьте миграции / запускайте вручную с нужными флагами.
npx prisma db push
exec node dist/index.js
