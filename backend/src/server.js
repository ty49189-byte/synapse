/**
 * MeetLink Connect - Main Server
 * WebRTC Video Collaboration Platform Backend
 */

require('dotenv').config();
const { createAdapter } = require('@socket.io/redis-adapter');
const { getPubSubClients } = require('./config/redis');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

const logger = require('./utils/logger');
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { setupSocketIO } = require('./services/socketService');
const { initializeMediasoup } = require('./services/mediasoupService');

// Routes
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const sessionRoutes = require('./routes/sessions');
const chatRoutes = require('./routes/chat');
const documentRoutes = require('./routes/documents');
const recordingRoutes = require('./routes/recordings');
const captionRoutes = require('./routes/captions');
const translationRoutes = require('./routes/translation');
const userRoutes = require('./routes/users');
const streamRoutes = require('./routes/streams');
const analyticsRoutes = require('./routes/analytics');

// Middleware
const { errorHandler } = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware/rateLimiter');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

// ─── Security & Compression ─────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "wss:", "ws:", "https:"],
      mediaSrc: ["'self'", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    }
  }
}));
app.use(compression());

// ─── CORS ────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.CLIENT_ORIGIN || 'http://localhost:3000',
      'http://localhost:5173', // Vite dev
      'http://localhost:8080',
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy violation'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Room-Token'],
};
app.use(cors(corsOptions));

// ─── Body Parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Logging ─────────────────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (message) => logger.http(message.trim()) }
}));

// ─── Rate Limiting ───────────────────────────────────────────────────────────
app.use('/api/', rateLimiter);

// ─── Static Files ────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV,
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/rooms', authenticateToken, roomRoutes);
app.use('/api/sessions', authenticateToken, sessionRoutes);
app.use('/api/chat', authenticateToken, chatRoutes);
app.use('/api/documents', authenticateToken, documentRoutes);
app.use('/api/recordings', authenticateToken, recordingRoutes);
app.use('/api/captions', authenticateToken, captionRoutes);
app.use('/api/translation', authenticateToken, translationRoutes);
app.use('/api/streams', authenticateToken, streamRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.path} not found` });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Socket.IO ───────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: corsOptions,
  maxHttpBufferSize: 50 * 1024 * 1024, // 50MB for file transfers
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    // Connect to MongoDB
    await connectDB();
    logger.info('✅ MongoDB connected');

    // Connect to Redis
    await connectRedis();
logger.info('✅ Redis connected');

// 🔥 Attach Redis Adapter to Socket.io
const { pub, sub } = getPubSubClients();
io.adapter(createAdapter(pub, sub));

logger.info('✅ Redis adapter connected to Socket.io');
    // Initialize Mediasoup SFU
    await initializeMediasoup();
    logger.info('✅ Mediasoup SFU initialized');

    // Setup Socket.IO handlers
    setupSocketIO(io);
    logger.info('✅ Socket.IO configured');

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      logger.info(`🚀 MeetLink Server running on port ${PORT} [${process.env.NODE_ENV}]`);
      logger.info(`📡 WebSocket ready for real-time collaboration`);
    });

  } catch (error) {
    logger.error('❌ Bootstrap failed:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

bootstrap();

module.exports = { app, server, io };
