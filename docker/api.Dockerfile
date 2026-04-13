FROM node:22-alpine

WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/bot/package.json apps/bot/

RUN npm ci

COPY apps/api ./apps/api

RUN npm run db:generate -w @rezonans/api && npm run build -w @rezonans/api

ENV NODE_ENV=production
EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push --schema=apps/api/prisma/schema.prisma && cd apps/api && node dist/index.js"]
