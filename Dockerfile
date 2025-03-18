# Start with Go image to build the binary
FROM --platform=$BUILDPLATFORM golang:1.23-alpine AS builder

# Install build dependencies including bash
RUN apk add --no-cache make git bash

# Set working directory
WORKDIR /app

# Add cache busting
ADD https://api.github.com/repos/akave-ai/akavesdk/git/refs/heads/main /tmp/version.json
RUN git clone -b main https://github.com/akave-ai/akavesdk .

# Set the target platform for the build
ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH make build

# Final image
FROM --platform=$TARGETPLATFORM alpine:3.19

# Install Node.js and npm
RUN apk add --no-cache nodejs npm

# Copy binary from builder
COPY --from=builder /app/bin/akavecli /usr/local/bin/akavecli

# Set working directory
WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy source files
COPY server.js ./
COPY index.js ./
COPY logger.js ./
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