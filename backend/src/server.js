/**
 * MeetLink Connect - Main Server
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

// ─── Security ─────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());

// ─── CORS ─────────────────────────────────────────────────
const corsOptions = {
  origin: true,
  credentials: true,
};
app.use(cors(corsOptions));

// ─── Body Parsing ─────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Logging ──────────────────────────────────────────────
app.use(morgan('dev'));

// ─── Rate Limiting ────────────────────────────────────────
app.use('/api/', rateLimiter);

// ─── Static Files ─────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ─── Health Check ─────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ─── API Routes ───────────────────────────────────────────
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

// ─── 404 ─────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.path} not found` });
});

// ─── Error Handler ───────────────────────────────────────
app.use(errorHandler);

// ─── Socket.IO ───────────────────────────────────────────
const io = new Server(server, {
  cors: corsOptions,
});

// 🔥 IN-MEMORY ROOM STORE
const rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // JOIN ROOM
  socket.on("join-room", ({ roomId, user }) => {
    socket.join(roomId);

    if (!rooms[roomId]) rooms[roomId] = [];

    const exists = rooms[roomId].find(u => u.id === user.id);
    if (!exists) {
      rooms[roomId].push({ ...user, socketId: socket.id });
    }

    // 🔥 SEND PARTICIPANTS
    io.to(roomId).emit("participants", rooms[roomId]);

    // 🔥 NOTIFY OTHERS (for WebRTC)
    socket.to(roomId).emit("user-joined", socket.id);
  });

  // 🔥 WEBRTC OFFER
  socket.on("offer", ({ offer, to }) => {
    io.to(to).emit("offer", {
      offer,
      from: socket.id,
    });
  });

  // 🔥 WEBRTC ANSWER
  socket.on("answer", ({ answer, to }) => {
    io.to(to).emit("answer", {
      answer,
      from: socket.id,
    });
  });

  // 💬 CHAT
  socket.on("send-message", ({ roomId, message }) => {
    io.to(roomId).emit("receive-message", message);
  });

  // LEAVE ROOM
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(u => u.socketId !== socket.id);

      io.to(roomId).emit("participants", rooms[roomId]);
    }
  });
});

// ─── START SERVER ────────────────────────────────────────
async function start() {
  try {
    await connectDB();
    console.log("✅ MongoDB connected");

    await connectRedis();
    console.log("✅ Redis connected");

    const { pub, sub } = getPubSubClients();
    io.adapter(createAdapter(pub, sub));

    await initializeMediasoup();
    console.log("✅ Mediasoup ready");

    // optional existing socket service
    

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("❌ Server failed:", err);
    process.exit(1);
  }
}

start();

module.exports = { app, server, io };