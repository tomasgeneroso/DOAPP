FROM node:20-alpine

WORKDIR /app

# Install dependencies for sharp
RUN apk add --no-cache vips-dev build-base python3

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create uploads directory
RUN mkdir -p /app/uploads

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --spider -q http://localhost:3002/health || exit 1

# Start service
CMD ["npm", "start"]
