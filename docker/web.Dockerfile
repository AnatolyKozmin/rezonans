FROM node:22-alpine AS build

WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/bot/package.json apps/bot/

RUN npm ci

COPY apps/web ./apps/web

RUN npm run build -w @rezonans/web

FROM nginx:alpine

COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
