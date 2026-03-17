const express = require('express');
const router = express.Router();
const { Session, Room, Recording, ChatMessage, User } = require('../models');

// GET /api/analytics/dashboard - User dashboard stats
router.get('/dashboard', async (req, res, next) => {
  try {
    const userRooms = await Room.find({
      $or: [{ host: req.userId }, { 'participants.user': req.userId }]
    }).select('_id status type');

    const roomIds = userRooms.map(r => r._id);
    const activeRooms = userRooms.filter(r => r.status === 'active').length;

    const [totalSessions, totalRecordings, totalMessages, recentSessions] = await Promise.all([
      Session.countDocuments({ room: { $in: roomIds } }),
      Recording.countDocuments({ room: { $in: roomIds }, status: 'ready' }),
      ChatMessage.countDocuments({ room: { $in: roomIds }, isDeleted: false }),
      Session.find({ room: { $in: roomIds } })
        .populate('room', 'name roomId type')
        .sort({ startedAt: -1 })
        .limit(5)
        .select('startedAt endedAt duration participantCount'),
    ]);

    // Total meeting time
    const sessions = await Session.find({ room: { $in: roomIds } }).select('duration');
    const totalMeetingTime = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);

    res.json({
      success: true,
      data: {
        stats: {
          totalRooms: userRooms.length,
          activeRooms,
          totalSessions,
          totalRecordings,
          totalMessages,
          totalMeetingTimeSeconds: totalMeetingTime,
          totalMeetingTimeHours: Math.round(totalMeetingTime / 3600 * 10) / 10,
        },
        recentSessions,
      }
    });
  } catch (err) { next(err); }
});

// GET /api/analytics/room/:roomId
router.get('/room/:roomId', async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const sessions = await Session.find({ room: room._id }).sort({ startedAt: -1 }).limit(50);
    const totalDuration = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);
    const avgParticipants = sessions.length
      ? Math.round(sessions.reduce((acc, s) => acc + (s.participantCount || 0), 0) / sessions.length)
      : 0;

    const chatCount = await ChatMessage.countDocuments({ room: room._id, isDeleted: false });
    const recordingCount = await Recording.countDocuments({ room: room._id, status: 'ready' });

    res.json({
      success: true,
      data: {
        room: { name: room.name, roomId: room.roomId, type: room.type },
        analytics: {
          totalSessions: sessions.length,
          totalDurationSeconds: totalDuration,
          avgSessionDurationMinutes: sessions.length ? Math.round(totalDuration / sessions.length / 60) : 0,
          avgParticipants,
          totalChatMessages: chatCount,
          totalRecordings: recordingCount,
        },
        sessions: sessions.slice(0, 10),
      }
    });
  } catch (err) { next(err); }
});

// GET /api/analytics/admin - Admin-level stats (teacher/admin only)
router.get('/admin', async (req, res, next) => {
  try {
    if (!['admin', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Admin/Teacher access required' });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [totalUsers, activeUsers, totalRooms, activeSessions] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastSeen: { $gte: thirtyDaysAgo } }),
      Room.countDocuments(),
      Session.countDocuments({ startedAt: { $gte: thirtyDaysAgo }, endedAt: null }),
    ]);

    // Daily session counts for last 7 days
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const dailySessions = await Session.aggregate([
      { $match: { startedAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
          count: { $sum: 1 },
          totalParticipants: { $sum: '$participantCount' },
        }
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      data: {
        overview: { totalUsers, activeUsers, totalRooms, activeSessions },
        dailySessions,
      }
    });
  } catch (err) { next(err); }
});

module.exports = router;
