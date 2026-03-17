const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Recording, Room, Session } = require('../models');
const logger = require('../utils/logger');

const RECORDING_DIR = path.join(__dirname, '../../uploads/recordings');
if (!fs.existsSync(RECORDING_DIR)) fs.mkdirSync(RECORDING_DIR, { recursive: true });

// Multer for recording chunk uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RECORDING_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB per recording
  fileFilter: (req, file, cb) => {
    const allowed = ['video/webm', 'video/mp4', 'audio/webm', 'audio/ogg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid recording format'));
  },
});

// GET /api/recordings - List recordings accessible to user
router.get('/', async (req, res, next) => {
  try {
    const { roomId, page = 1, limit = 20, status } = req.query;
    const query = {
      $or: [
        { startedBy: req.userId },
        { accessList: req.userId },
        { isPublic: true },
      ],
    };
    if (status) query.status = status;

    if (roomId) {
      const room = await Room.findOne({ roomId });
      if (room) query.room = room._id;
    }

    const recordings = await Recording.find(query)
      .populate('startedBy', 'name avatar')
      .populate('room', 'name roomId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Recording.countDocuments(query);

    res.json({
      success: true,
      data: {
        recordings,
        pagination: { total, page: parseInt(page), limit: parseInt(limit) },
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/recordings/:id
router.get('/:id', async (req, res, next) => {
  try {
    const recording = await Recording.findById(req.params.id)
      .populate('startedBy', 'name avatar')
      .populate('room', 'name roomId type')
      .populate('transcript');

    if (!recording) return res.status(404).json({ success: false, message: 'Recording not found' });

    const hasAccess =
      recording.startedBy._id.toString() === req.userId ||
      recording.accessList.includes(req.userId) ||
      recording.isPublic;

    if (!hasAccess) return res.status(403).json({ success: false, message: 'Access denied' });

    res.json({ success: true, data: { recording } });
  } catch (err) {
    next(err);
  }
});

// POST /api/recordings/upload - Upload recorded video file
router.post('/upload', upload.single('recording'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No recording file provided' });

    const { recordingId, roomId } = req.body;
    const fileUrl = `/uploads/recordings/${req.file.filename}`;

    let recording;
    if (recordingId) {
      recording = await Recording.findByIdAndUpdate(
        recordingId,
        {
          url: fileUrl,
          size: req.file.size,
          status: 'ready',
        },
        { new: true }
      );
    } else {
      const room = await Room.findOne({ roomId });
      recording = await Recording.create({
        room: room?._id,
        startedBy: req.userId,
        url: fileUrl,
        size: req.file.size,
        status: 'ready',
        startedAt: new Date(),
        endedAt: new Date(),
      });
    }

    res.json({
      success: true,
      message: 'Recording uploaded successfully',
      data: { recording }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/recordings/:id/download
router.get('/:id/download', async (req, res, next) => {
  try {
    const recording = await Recording.findById(req.params.id);
    if (!recording) return res.status(404).json({ success: false, message: 'Recording not found' });

    const hasAccess =
      recording.startedBy.toString() === req.userId ||
      recording.accessList.includes(req.userId) ||
      recording.isPublic;

    if (!hasAccess) return res.status(403).json({ success: false, message: 'Access denied' });

    if (!recording.url) return res.status(404).json({ success: false, message: 'Recording file not available' });

    const filePath = path.join(__dirname, '../..', recording.url);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Recording file not found on server' });
    }

    const fileName = `recording-${recording._id}.webm`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'video/webm');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/recordings/:id - Update recording metadata or share
router.patch('/:id', async (req, res, next) => {
  try {
    const { isPublic, accessList, title } = req.body;
    const recording = await Recording.findById(req.params.id);
    if (!recording) return res.status(404).json({ success: false, message: 'Recording not found' });

    if (recording.startedBy.toString() !== req.userId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (isPublic !== undefined) recording.isPublic = isPublic;
    if (accessList) recording.accessList = accessList;
    await recording.save();

    res.json({ success: true, data: { recording } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/recordings/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const recording = await Recording.findById(req.params.id);
    if (!recording) return res.status(404).json({ success: false, message: 'Recording not found' });

    if (recording.startedBy.toString() !== req.userId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Delete file
    if (recording.url) {
      const filePath = path.join(__dirname, '../..', recording.url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await Recording.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Recording deleted' });
  } catch (err) {
    next(err);
  }
});

// GET /api/recordings/room/:roomId
router.get('/room/:roomId', async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const recordings = await Recording.find({ room: room._id, status: 'ready' })
      .populate('startedBy', 'name avatar')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: { recordings } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
