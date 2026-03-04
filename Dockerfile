# DevMate Dockerfile
# Usage: docker run -it devmate

FROM oven/bun:1-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN bun install

# Copy source
COPY src ./src

# Build
RUN bun run build

# Make executable
RUN chmod +x dist/index.js

# Create non-root user
RUN adduser -D devmate
USER devmate

# Default command
ENTRYPOINT ["./dist/index.js"]

# Allow interactive shell
CMD ["./dist/index.js"]
