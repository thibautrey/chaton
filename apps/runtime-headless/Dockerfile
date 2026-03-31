FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.cloud.json ./
RUN npm ci --ignore-scripts

COPY apps ./apps
COPY packages ./packages

RUN npm run build:cloud

FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/dist-cloud ./dist-cloud

EXPOSE 4002

CMD ["node", "dist-cloud/apps/runtime-headless/server.js"]
