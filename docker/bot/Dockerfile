FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/bot/package.json apps/bot/
RUN npm ci

FROM deps AS build
COPY apps/bot ./apps/bot
WORKDIR /app/apps/bot
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/bot/dist ./apps/bot/dist
COPY apps/bot/package.json ./apps/bot/
WORKDIR /app/apps/bot
CMD ["node", "dist/index.js"]
