const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Room, Session, ChatMessage, Recording } = require('../models');
const { requireRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

// Generate a short room ID like Google Meet (abc-defg-hij)
function generateRoomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const part = (len) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part(3)}-${part(4)}-${part(3)}`;
}

// ============================================================
// POST /api/rooms - Create a new room
// ============================================================
router.post('/', async (req, res, next) => {
  try {
    const {
      name, description, type = 'meeting', isPrivate = true,
      password, maxParticipants = 100, scheduledAt, settings,
      tags, course, subject, sessionNumber,
    } = req.body;

    if (!name) return res.status(400).json({ success: false, message: 'Room name is required' });

    let roomId = generateRoomId();
    while (await Room.findOne({ roomId })) {
      roomId = generateRoomId();
    }

    const roomData = {
      name,
      description,
      roomId,
      host: req.userId,
      type,
      isPrivate,
      maxParticipants: Math.min(maxParticipants, 500),
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: scheduledAt ? 'scheduled' : 'scheduled',
      settings: {
        waitingRoom: false,
        muteOnEntry: false,
        videoOffOnEntry: false,
        allowChat: true,
        allowRecording: true,
        allowScreenShare: true,
        allowDocuments: true,
        enableCaptions: false,
        ...settings,
      },
      tags: tags || [],
      course,
      subject,
      sessionNumber: sessionNumber || 1,
    };

    if (password) {
      roomData.password = await bcrypt.hash(password, 10);
    }

    const room = await Room.create(roomData);
    await room.populate('host', 'name avatar role');

    res.status(201).json({
      success: true,
      message: 'Room created successfully',
      data: { room: formatRoom(room) },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/rooms - Get user's rooms
// ============================================================
router.get('/', async (req, res, next) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const query = {
      $or: [
        { host: req.userId },
        { 'participants.user': req.userId },
        { coHosts: req.userId },
      ],
    };

    if (status) query.status = status;
    if (type) query.type = type;

    const [rooms, total] = await Promise.all([
      Room.find(query)
        .populate('host', 'name avatar role')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Room.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        rooms: rooms.map(formatRoom),
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      }
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/rooms/:roomId - Get room details
// ============================================================
router.get('/:roomId', async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId })
      .populate('host', 'name avatar role email')
      .populate('participants.user', 'name avatar role')
      .populate('coHosts', 'name avatar role');

    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    res.json({ success: true, data: { room: formatRoom(room) } });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PATCH /api/rooms/:roomId - Update room
// ============================================================
router.patch('/:roomId', async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    if (room.host.toString() !== req.userId) {
      return res.status(403).json({ success: false, message: 'Only host can update room' });
    }

    const allowedFields = ['name', 'description', 'settings', 'maxParticipants', 'isPrivate', 'tags'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'settings') {
          room.settings = { ...room.settings, ...req.body.settings };
        } else {
          room[field] = req.body[field];
        }
      }
    }

    if (req.body.password) {
      room.password = await bcrypt.hash(req.body.password, 10);
    }

    await room.save();

    res.json({
      success: true,
      message: 'Room updated',
      data: { room: formatRoom(room) },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// DELETE /api/rooms/:roomId
// ============================================================
router.delete('/:roomId', async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    if (room.host.toString() !== req.userId) {
      return res.status(403).json({ success: false, message: 'Only host can delete' });
    }

    await Room.findByIdAndDelete(room._id);

    res.json({ success: true, message: 'Room deleted' });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/rooms/instant - Instant meeting
// ============================================================
router.post('/instant', async (req, res, next) => {
  try {
    const { name } = req.body;
    const roomId = generateRoomId();

    const room = await Room.create({
      name: name || "Instant Session",
      roomId,
      host: req.userId,
      type: 'meeting',
      status: 'active',
      startedAt: new Date(),
      participants: [],
      settings: {
        waitingRoom: false,
        muteOnEntry: false,
        allowChat: true,
        allowScreenShare: true,
      },
    });

    await room.populate('host', 'name avatar role');

    res.status(201).json({
      success: true,
      message: 'Instant meeting created',
      data: {
        room: formatRoom(room),
        joinUrl: `${process.env.CLIENT_ORIGIN || 'http://localhost:3000'}/room/${roomId}`,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// FORMAT ROOM (🔥 CRITICAL FIX HERE)
// ============================================================
function formatRoom(room) {
  const r = room.toObject ? room.toObject() : room;

  const isLive = r.status === "active";

  return {
    id: r._id,
    _id: r._id,
    name: r.name,
    description: r.description,
    roomId: r.roomId,
    host: r.host,
    coHosts: r.coHosts,
    type: r.type,
    status: r.status,
    isLive: isLive,
    isActive: isLive,
    isPrivate: r.isPrivate,
    maxParticipants: r.maxParticipants,
    participants: r.participants || [],
    participantCount: r.participants?.length || 0,
    scheduledAt: r.scheduledAt,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    duration: r.duration,
    settings: r.settings,
    tags: r.tags,
    course: r.course,
    subject: r.subject,
    sessionNumber: r.sessionNumber,
    joinUrl: `${process.env.CLIENT_ORIGIN || 'http://localhost:3000'}/room/${r.roomId}`,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

module.exports = router;