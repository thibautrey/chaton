FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY apps/cloud-realtime ./apps/cloud-realtime

EXPOSE 4001

CMD ["node", "apps/cloud-realtime/server.ts"]
