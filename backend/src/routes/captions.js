const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Transcript, Room, Session } = require('../models');
const { transcribeAudio } = require('../services/translationService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB audio
});

// GET /api/captions/:roomId/transcript - Get live/stored transcript
router.get('/:roomId/transcript', async (req, res, next) => {
  try {
    const { sessionId } = req.query;
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const query = { room: room._id };
    if (sessionId) query.session = sessionId;

    const transcript = await Transcript.findOne(query)
      .populate('entries.speaker', 'name avatar')
      .sort({ createdAt: -1 });

    if (!transcript) {
      return res.json({ success: true, data: { transcript: null, entries: [] } });
    }

    res.json({ success: true, data: { transcript } });
  } catch (err) {
    next(err);
  }
});

// GET /api/captions/:roomId/transcripts - All transcripts for a room
router.get('/:roomId/transcripts', async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const transcripts = await Transcript.find({ room: room._id })
      .populate('session', 'startedAt endedAt duration')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ success: true, data: { transcripts } });
  } catch (err) {
    next(err);
  }
});

// POST /api/captions/transcribe-chunk - Transcribe uploaded audio chunk
router.post('/transcribe-chunk', upload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Audio chunk required' });

    const { language = 'en', sessionId, roomId } = req.body;

    const result = await transcribeAudio(req.file.buffer, req.file.mimetype, language);

    // Store in transcript if session is active
    if (sessionId && result.transcript) {
      await Transcript.findOneAndUpdate(
        { session: sessionId },
        {
          $push: {
            entries: {
              speaker: req.userId,
              speakerName: req.user.name,
              text: result.transcript,
              confidence: result.confidence,
              startTime: Date.now() / 1000,
            }
          },
          $inc: { wordCount: result.transcript.split(' ').length },
          $set: { status: 'live' },
        },
        { upsert: true, new: true }
      );
    }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/captions/transcript/:id/export - Export transcript
router.get('/transcript/:id/export', async (req, res, next) => {
  try {
    const { format = 'txt' } = req.query;
    const transcript = await Transcript.findById(req.params.id)
      .populate('entries.speaker', 'name')
      .populate('room', 'name roomId');

    if (!transcript) return res.status(404).json({ success: false, message: 'Transcript not found' });

    if (format === 'srt') {
      // Generate SRT subtitle format
      const srtLines = transcript.entries.map((entry, idx) => {
        const start = formatSrtTime(entry.startTime || 0);
        const end = formatSrtTime((entry.endTime || entry.startTime + 3) || 3);
        return `${idx + 1}\n${start} --> ${end}\n${entry.speakerName}: ${entry.text}\n`;
      });

      res.setHeader('Content-Type', 'text/srt');
      res.setHeader('Content-Disposition', `attachment; filename="transcript-${req.params.id}.srt"`);
      return res.send(srtLines.join('\n'));
    }

    if (format === 'vtt') {
      const vttLines = ['WEBVTT\n'];
      transcript.entries.forEach((entry, idx) => {
        const start = formatVttTime(entry.startTime || 0);
        const end = formatVttTime((entry.endTime || entry.startTime + 3) || 3);
        vttLines.push(`${idx + 1}\n${start} --> ${end}\n${entry.speakerName}: ${entry.text}\n`);
      });

      res.setHeader('Content-Type', 'text/vtt');
      res.setHeader('Content-Disposition', `attachment; filename="transcript-${req.params.id}.vtt"`);
      return res.send(vttLines.join('\n'));
    }

    if (format === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename="transcript-${req.params.id}.json"`);
      return res.json({
        room: transcript.room?.name,
        language: transcript.language,
        exportedAt: new Date().toISOString(),
        wordCount: transcript.wordCount,
        entries: transcript.entries.map(e => ({
          speaker: e.speakerName,
          text: e.text,
          confidence: e.confidence,
          startTime: e.startTime,
          endTime: e.endTime,
        })),
      });
    }

    // Default txt
    const lines = transcript.entries.map(e => {
      const time = e.startTime ? `[${formatHMS(e.startTime)}]` : '';
      return `${time} ${e.speakerName}: ${e.text}`;
    });

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="transcript-${req.params.id}.txt"`);
    res.send(`Transcript - ${transcript.room?.name || 'Session'}\nLanguage: ${transcript.language}\n${'─'.repeat(60)}\n\n${lines.join('\n')}`);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/captions/transcript/:id
router.delete('/transcript/:id', async (req, res, next) => {
  try {
    await Transcript.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Transcript deleted' });
  } catch (err) {
    next(err);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSrtTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const ms = Math.round((seconds % 1) * 1000).toString().padStart(3, '0');
  return `${h}:${m}:${s},${ms}`;
}

function formatVttTime(seconds) {
  return formatSrtTime(seconds).replace(',', '.');
}

function formatHMS(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
}

module.exports = router;
