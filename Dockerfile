FROM --platform=$BUILDPLATFORM golang:1.22-alpine AS go-builder
ARG TARGETOS
ARG TARGETARCH
WORKDIR /app
RUN apk add --no-cache make git bash

# Copy all files to the container
COPY . /app/

# Compile the Go application
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH make build

# Install Node.js dependencies and compile TypeScript (if present)
FROM node:16-alpine AS node-builder
WORKDIR /app

# Copy Node.js package files
COPY package*.json ./

# Install all dependencies including development ones necessary for build
RUN npm install

# Copy the rest of the application files
COPY . .

# Compile TypeScript only if tsconfig.json is present
RUN if [ -f tsconfig.json ]; then \
        npm install -g typescript && tsc; \
    else \
        echo "No TypeScript files detected"; \
    fi

# Stage 3: Final runtime image
FROM alpine:3.19 AS runtime
WORKDIR /app

# Install Node.js and npm for the runtime environment
RUN apk add --no-cache nodejs npm

# Copy binary from Go builder
COPY --from=go-builder /app/bin/akavecli /usr/local/bin/akavecli

# If TypeScript compiled, use it, otherwise use source
COPY --from=node-builder /app/dist/ ./dist
COPY --from=node-builder /app/src/ ./src

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install --only=production

# Set environment variables
ENV NODE_ADDRESS=""
ENV PRIVATE_KEY=""
ENV PORT=3000
ENV CORS_ORIGIN="*"

# Expose API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Prefer compiled JS from dist, fallback to src
CMD ["sh", "-c", "if [ -d dist ]; then node dist/server.js; else node src/server.js; fi"]