FROM node:22-alpine

WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/bot/package.json apps/bot/

RUN npm ci

COPY apps/bot ./apps/bot

RUN npm run build -w @rezonans/bot

ENV NODE_ENV=production

CMD ["node", "apps/bot/dist/index.js"]
