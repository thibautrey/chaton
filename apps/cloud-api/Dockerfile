FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY apps/cloud-api ./apps/cloud-api
COPY packages ./packages

EXPOSE 4000

CMD ["node", "apps/cloud-api/server.ts"]
