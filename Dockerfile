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

# Stage 2: Build TypeScript (if present)
FROM node:16-alpine AS typescript-build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (include TypeScript if necessary)
RUN npm install

# Check if tsconfig.json exists, and if so, install TypeScript and compile
COPY tsconfig.json ./
COPY src/ ./src/
RUN [ -f tsconfig.json ] && npm install -g typescript && tsc || echo "No TypeScript files detected"

# Stage 3: Final runtime image
FROM alpine:3.19

# Install runtime dependencies
RUN apk add --no-cache nodejs npm bash

# Copy binary from builder
COPY --from=builder /app/bin/akavecli /usr/local/bin/akavecli

# Copy compiled TypeScript (if any) and other files
COPY --from=typescript-build /app/dist ./dist/
COPY --from=typescript-build /app/src ./src/ 

# Copy package files first (better layer caching)
COPY package*.json ./

# Set environment variables
ENV NODE_ADDRESS=""
ENV PRIVATE_KEY=""
ENV PORT=3000
ENV CORS_ORIGIN="*"

# Expose the API port
EXPOSE 3000

# Health check for the service
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the server based on available files
CMD ["sh", "-c", "node dist/server.js || node src/server.js"]
