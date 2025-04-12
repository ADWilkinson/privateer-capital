# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create a non-root user to run the application
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
# Copy any additional necessary files
COPY --from=builder /app/node_modules ./node_modules

# Create a directory for secrets with proper permissions
RUN mkdir -p /secrets && chown -R appuser:appgroup /secrets

# Default environment variables for Cloud Run
ENV PORT=8080
ENV NODE_ENV=production
ENV TZ=UTC

# Expose the API port
EXPOSE 8080

# Switch to non-root user
USER appuser

# Add health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start the server with garbage collection exposed for memory optimization
CMD ["node", "--expose-gc", "dist/index.js"]