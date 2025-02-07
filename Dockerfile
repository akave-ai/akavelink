# Start with Go image to build the binary
FROM --platform=$BUILDPLATFORM golang:1.22-alpine AS builder

# Build arguments for versioning
ARG BUILD_VERSION
ARG GIT_COMMIT
ARG BUILD_DATE

# Install build dependencies including bash
RUN apk add --no-cache make git bash

# Set working directory
WORKDIR /app

# Cache bust git clone using commit SHA
ARG CACHE_BUST
RUN git clone https://github.com/akave-ai/akavesdk . && \
    git reset --hard ${GIT_COMMIT}

# Set the target platform for the build
ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH make build

# Final image
FROM --platform=$TARGETPLATFORM alpine:3.19

# Add version labels
LABEL version="${BUILD_VERSION}" \
      git_commit="${GIT_COMMIT}" \
      build_date="${BUILD_DATE}" \
      description="Akave Link API Service"

# Install Node.js and npm
RUN apk add --no-cache nodejs npm

# Copy binary from builder
COPY --from=builder /app/bin/akavecli /usr/local/bin/akavecli

# Set working directory
WORKDIR /app

# Copy package files first (better layer caching) and force npm to fetch latest packages
COPY package*.json ./
RUN npm ci --no-cache --only=production && npm cache clean --force

# Copy source files
COPY server.js ./
COPY index.js ./
COPY web3-utils.js ./

# Environment variables with defaults
ENV NODE_ADDRESS=""
ENV PRIVATE_KEY=""
ENV PORT=3000
ENV CORS_ORIGIN="*"

# Expose API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the API server
CMD ["node", "server.js"]