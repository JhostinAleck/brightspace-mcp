# syntax=docker/dockerfile:1.7

# The compiled JS is platform-independent: build it once on the runner's
# native platform instead of under QEMU for every target architecture.
FROM --platform=$BUILDPLATFORM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production dependencies per target platform (prebuilt native binaries).
# No production dependency needs an install script.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:24-alpine AS runtime
LABEL org.opencontainers.image.title="brightspace-mcp"
LABEL org.opencontainers.image.description="MCP server for D2L Brightspace (multi-auth, opt-in writes, session cache)"
LABEL org.opencontainers.image.source="https://github.com/JhostinAleck/brightspace-mcp"
LABEL org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY package.json README.md LICENSE ./
RUN chown -R node:node /app
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node build/cli/main.js --version || exit 1
ENTRYPOINT ["node", "build/cli/main.js"]
CMD ["serve"]
