# ============================================
# DOAPP - Production Dockerfile
# Multi-stage build for optimized image
# ============================================

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY tailwind.config.js ./
COPY postcss.config.js ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy source files
COPY client/ ./client/
COPY public/ ./public/
COPY index.html ./

# Build frontend
RUN npm run build:client

# ============================================
# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies (including dev for build)
RUN npm ci --legacy-peer-deps

# Copy source files
COPY server/ ./server/

# Compile TypeScript
RUN npm run build:server

# ============================================
# Stage 3: Production Image
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S doapp -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production --legacy-peer-deps && \
    npm cache clean --force

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/dist ./dist

# Copy built backend from stage 2
COPY --from=backend-builder /app/dist/server ./dist/server

# Copy public files and locales
COPY public/ ./public/
COPY server/locales/ ./server/locales/

# Create necessary directories
RUN mkdir -p logs uploads/avatars uploads/documents uploads/portfolio uploads/disputes uploads/payment-proofs uploads/invoices uploads/receipts && \
    chown -R doapp:nodejs logs uploads

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Switch to non-root user
USER doapp

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Start the application
CMD ["node", "dist/server/index.js"]
