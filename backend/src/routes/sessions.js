// ============================================================
// sessions.js
// ============================================================
const express = require('express');
const sessionRouter = express.Router();
const { Session, Room, Transcript, Recording, ChatMessage } = require('../models');

// GET /api/sessions - List user sessions
sessionRouter.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const userRooms = await Room.find({
      $or: [{ host: req.userId }, { 'participants.user': req.userId }]
    }).select('_id');
    const roomIds = userRooms.map(r => r._id);

    const sessions = await Session.find({ room: { $in: roomIds } })
      .populate('room', 'name roomId type')
      .sort({ startedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, data: { sessions } });
  } catch (err) { next(err); }
});

// GET /api/sessions/:id - Session details
sessionRouter.get('/:id', async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id)
      .populate('room', 'name roomId type host')
      .populate('participants.user', 'name avatar');
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    res.json({ success: true, data: { session } });
  } catch (err) { next(err); }
});

// GET /api/sessions/:id/summary - Full session summary (transcript + chat + recording)
sessionRouter.get('/:id/summary', async (req, res, next) => {
  try {
    const [session, transcript, recording, chatCount] = await Promise.all([
      Session.findById(req.params.id).populate('room', 'name roomId'),
      Transcript.findOne({ session: req.params.id }).select('wordCount entries language'),
      Recording.findOne({ session: req.params.id }).select('url duration status'),
      ChatMessage.countDocuments({ session: req.params.id, isDeleted: false }),
    ]);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    res.json({
      success: true,
      data: {
        session,
        transcript: transcript ? { wordCount: transcript.wordCount, entryCount: transcript.entries.length, language: transcript.language } : null,
        recording: recording || null,
        chatMessageCount: chatCount,
      }
    });
  } catch (err) { next(err); }
});

module.exports = sessionRouter;
