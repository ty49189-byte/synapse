const express = require('express');
const router = express.Router();
const { ChatMessage, Room } = require('../models');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

// GET /api/chat/:roomId/history
router.get('/:roomId/history', async (req, res, next) => {
  try {
    const { page = 1, limit = 100, before } = req.query;
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const query = { room: room._id, isDeleted: false };
    if (before) query.timestamp = { $lt: new Date(before) };

    const messages = await ChatMessage.find(query)
      .populate('sender', 'name avatar role')
      .populate('replyTo', 'content senderName')
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: {
        messages: messages.reverse(),
        page: parseInt(page),
        limit: parseInt(limit),
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/chat/:roomId/export - Export chat as JSON or text
router.get('/:roomId/export', async (req, res, next) => {
  try {
    const { format = 'json', sessionId } = req.query;
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const query = { room: room._id, isDeleted: false };
    if (sessionId) query.session = sessionId;

    const messages = await ChatMessage.find(query)
      .populate('sender', 'name role')
      .sort({ timestamp: 1 })
      .lean();

    if (format === 'txt') {
      const lines = messages.map(m => {
        const time = new Date(m.timestamp).toLocaleTimeString('en-US', { hour12: false });
        const date = new Date(m.timestamp).toLocaleDateString();
        return `[${date} ${time}] ${m.senderName} (${m.senderRole}): ${m.content}`;
      });

      const text = `Chat Export - ${room.name}\nDate: ${new Date().toISOString()}\n${'─'.repeat(60)}\n\n${lines.join('\n')}`;

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="chat-${room.roomId}-${Date.now()}.txt"`);
      return res.send(text);
    }

    // Default JSON export
    const exportData = {
      room: { name: room.name, roomId: room.roomId },
      exportedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages: messages.map(m => ({
        id: m._id,
        sender: m.senderName,
        role: m.senderRole,
        content: m.content,
        type: m.type,
        timestamp: m.timestamp,
        fileUrl: m.fileUrl,
        fileName: m.fileName,
      })),
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="chat-${room.roomId}-${Date.now()}.json"`);
    return res.json(exportData);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/chat/:messageId
router.delete('/:messageId', async (req, res, next) => {
  try {
    const message = await ChatMessage.findById(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    if (message.sender.toString() !== req.userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this message' });
    }

    message.isDeleted = true;
    message.content = '[Message deleted]';
    await message.save();

    res.json({ success: true, message: 'Message deleted' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/chat/:messageId - Edit message
router.patch('/:messageId', async (req, res, next) => {
  try {
    const { content } = req.body;
    const message = await ChatMessage.findById(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    if (message.sender.toString() !== req.userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this message' });
    }

    message.content = content;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    res.json({ success: true, data: { message } });
  } catch (err) {
    next(err);
  }
});

// POST /api/chat/:messageId/react
router.post('/:messageId/react', async (req, res, next) => {
  try {
    const { emoji } = req.body;
    const message = await ChatMessage.findById(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    const existingReaction = message.reactions.find(r => r.emoji === emoji);
    if (existingReaction) {
      const userIdx = existingReaction.users.indexOf(req.userId);
      if (userIdx !== -1) {
        existingReaction.users.splice(userIdx, 1); // Toggle off
      } else {
        existingReaction.users.push(req.userId);
      }
    } else {
      message.reactions.push({ emoji, users: [req.userId] });
    }

    // Remove empty reactions
    message.reactions = message.reactions.filter(r => r.users.length > 0);
    await message.save();

    res.json({ success: true, data: { reactions: message.reactions } });
  } catch (err) {
    next(err);
  }
});

// GET /api/chat/:roomId/search
router.get('/:roomId/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ success: false, message: 'Query required' });

    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const messages = await ChatMessage.find({
      room: room._id,
      isDeleted: false,
      content: { $regex: q, $options: 'i' },
    })
      .populate('sender', 'name avatar')
      .sort({ timestamp: -1 })
      .limit(50);

    res.json({ success: true, data: { messages, query: q } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
