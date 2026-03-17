// ============================================================
// streams.js
// ============================================================
const express = require('express');
const streamRouter = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Stream, Room } = require('../models');

// POST /api/streams - Create a live stream
streamRouter.post('/', async (req, res, next) => {
  try {
    const { roomId, title, description, isPublic = true, tags, category, scheduledAt } = req.body;

    const room = roomId ? await Room.findOne({ roomId }) : null;
    const streamKey = `sk_${uuidv4().replace(/-/g, '')}`;

    const stream = await Stream.create({
      room: room?._id,
      host: req.userId,
      title,
      description,
      streamKey,
      isPublic,
      tags: tags || [],
      category,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: scheduledAt ? 'scheduled' : 'scheduled',
    });

    res.status(201).json({
      success: true,
      data: {
        stream,
        rtmpUrl: `rtmp://${process.env.STREAM_SERVER || 'localhost'}/live`,
        streamKey,
        playbackUrl: `/api/streams/${stream._id}/play`,
      }
    });
  } catch (err) { next(err); }
});

// GET /api/streams - List public/user streams
streamRouter.get('/', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { $or: [{ host: req.userId }, { isPublic: true }] };
    if (status) query.status = status;

    const streams = await Stream.find(query)
      .populate('host', 'name avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, data: { streams } });
  } catch (err) { next(err); }
});

// POST /api/streams/:id/start
streamRouter.post('/:id/start', async (req, res, next) => {
  try {
    const stream = await Stream.findById(req.params.id);
    if (!stream) return res.status(404).json({ success: false, message: 'Stream not found' });
    if (stream.host.toString() !== req.userId) return res.status(403).json({ success: false, message: 'Not authorized' });

    stream.status = 'live';
    stream.startedAt = new Date();
    await stream.save();

    res.json({ success: true, data: { stream } });
  } catch (err) { next(err); }
});

// POST /api/streams/:id/end
streamRouter.post('/:id/end', async (req, res, next) => {
  try {
    const stream = await Stream.findById(req.params.id);
    if (!stream) return res.status(404).json({ success: false, message: 'Stream not found' });

    stream.status = 'ended';
    stream.endedAt = new Date();
    stream.duration = stream.startedAt ? Math.round((stream.endedAt - stream.startedAt) / 1000) : 0;
    await stream.save();

    res.json({ success: true, data: { stream } });
  } catch (err) { next(err); }
});

// DELETE /api/streams/:id
streamRouter.delete('/:id', async (req, res, next) => {
  try {
    const stream = await Stream.findById(req.params.id);
    if (!stream) return res.status(404).json({ success: false, message: 'Stream not found' });
    if (stream.host.toString() !== req.userId) return res.status(403).json({ success: false, message: 'Not authorized' });

    await Stream.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Stream deleted' });
  } catch (err) { next(err); }
});

module.exports = streamRouter;
