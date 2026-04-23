# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
LABEL org.opencontainers.image.title="brightspace-mcp"
LABEL org.opencontainers.image.description="MCP server for D2L Brightspace (multi-auth, opt-in writes, session cache)"
LABEL org.opencontainers.image.source="https://github.com/JhostinAleck/brightspace-mcp"
LABEL org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY package.json README.md LICENSE ./
RUN chown -R node:node /app
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1
ENTRYPOINT ["node", "build/cli/main.js"]
CMD ["serve"]
