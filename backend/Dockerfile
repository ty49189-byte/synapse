FROM node:20-alpine

# Install system dependencies for Mediasoup
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    linux-headers \
    udev \
    ffmpeg

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Create upload directories
RUN mkdir -p uploads/documents uploads/recordings uploads/avatars logs

# Expose port
EXPOSE 5000

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

CMD ["node", "src/server.js"]
