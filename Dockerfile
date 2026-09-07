FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/client/package.json client/package.json
COPY --from=build /app/server/package.json server/package.json
RUN npm ci --omit=dev && mkdir -p /app/data && chown -R node:node /app
COPY --from=build --chown=node:node /app/server server
COPY --from=build --chown=node:node /app/client/dist client/dist
COPY --from=build --chown=node:node /app/shared shared
USER node
EXPOSE 4000
VOLUME ["/app/data"]
CMD ["node", "server/src/index.js"]
