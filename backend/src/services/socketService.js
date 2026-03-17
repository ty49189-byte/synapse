/**
 * Socket.IO Service - Core WebRTC Signaling & Real-time Collaboration
 * 
 * Handles:
 * - WebRTC peer connection signaling (offer/answer/ICE)
 * - Room management (join/leave/create)
 * - Live chat messaging
 * - Screen sharing coordination
 * - Live captions & transcription relay
 * - Recording state management
 * - Document sharing & collaborative annotation
 * - Polls & reactions
 * - Breakout rooms
 * - Participant controls (mute/unmute/kick)
 * - Live streaming coordination
 */

const { authenticateSocketToken } = require('../middleware/auth');
const { cache } = require('../config/redis');
const { Room, Session, ChatMessage, User } = require('../models');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// In-memory room state (backed by Redis for multi-instance)
const activeRooms = new Map();    // roomId -> { participants, session, etc. }
const socketToRoom = new Map();   // socketId -> roomId
const waitingRooms = new Map();   // roomId -> [{ socketId, userId, name }]

function setupSocketIO(io) {
  // Authenticate every socket connection
  io.use(authenticateSocketToken);

  io.on('connection', async (socket) => {
    logger.info(`Socket connected: ${socket.id} (user: ${socket.userId})`);

    // Update user online status
    await User.findByIdAndUpdate(socket.userId, { isOnline: true, lastSeen: new Date() });

    // ─── ROOM MANAGEMENT ────────────────────────────────────────────────────

    socket.on('room:join', async (data, callback) => {
      try {
        const { roomId, password, displayName, videoEnabled, audioEnabled } = data;

        // Find room in DB
        const room = await Room.findOne({ roomId })
          .populate('host', 'name avatar role')
          .populate('participants.user', 'name avatar role');

        if (!room) {
          return callback?.({ success: false, error: 'Room not found' });
        }

        // Check room status
        if (room.status === 'ended') {
          return callback?.({ success: false, error: 'This session has ended' });
        }

        // Check password if private
        if (room.isPrivate && room.password) {
          const bcrypt = require('bcryptjs');
          const valid = await bcrypt.compare(password || '', room.password);
          if (!valid) return callback?.({ success: false, error: 'Incorrect room password' });
        }

        // Waiting room check
        if (room.settings.waitingRoom && room.host._id.toString() !== socket.userId) {
          const isCoHost = room.coHosts?.some(h => h.toString() === socket.userId);
          if (!isCoHost) {
            // Add to waiting room
            if (!waitingRooms.has(roomId)) waitingRooms.set(roomId, []);
            waitingRooms.get(roomId).push({
              socketId: socket.id,
              userId: socket.userId,
              name: displayName || socket.userName,
              requestedAt: new Date(),
            });

            // Notify host
            const roomState = activeRooms.get(roomId);
            if (roomState) {
              roomState.participants.forEach(p => {
                if (p.userId === room.host._id.toString() || room.coHosts?.includes(p.userId)) {
                  io.to(p.socketId).emit('waiting-room:participant-waiting', {
                    socketId: socket.id,
                    userId: socket.userId,
                    name: displayName,
                  });
                }
              });
            }

            return callback?.({ success: true, status: 'waiting', message: 'Waiting for host approval' });
          }
        }

        await joinRoom(socket, io, room, { displayName, videoEnabled, audioEnabled, callback });

      } catch (err) {
        logger.error('room:join error:', err);
        callback?.({ success: false, error: 'Failed to join room' });
      }
    });

    socket.on('waiting-room:admit', ({ socketId, userId }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;

      const waitList = waitingRooms.get(roomId) || [];
      const idx = waitList.findIndex(p => p.socketId === socketId);
      if (idx !== -1) waitList.splice(idx, 1);

      io.to(socketId).emit('waiting-room:admitted');
    });

    socket.on('waiting-room:deny', ({ socketId }) => {
      io.to(socketId).emit('waiting-room:denied', { reason: 'Host denied your entry' });
    });

    socket.on('room:leave', async () => {
      await handleLeave(socket, io);
    });

    socket.on('disconnect', async () => {
      logger.info(`Socket disconnected: ${socket.id}`);
      await handleLeave(socket, io);
      await User.findByIdAndUpdate(socket.userId, { isOnline: false, lastSeen: new Date() });
    });

    // ─── WebRTC SIGNALING ────────────────────────────────────────────────────

    socket.on('signal:offer', ({ targetSocketId, offer, metadata }) => {
      io.to(targetSocketId).emit('signal:offer', {
        fromSocketId: socket.id,
        fromUserId: socket.userId,
        offer,
        metadata, // { name, avatar, role, videoEnabled, audioEnabled }
      });
    });

    socket.on('signal:answer', ({ targetSocketId, answer }) => {
      io.to(targetSocketId).emit('signal:answer', {
        fromSocketId: socket.id,
        answer,
      });
    });

    socket.on('signal:ice-candidate', ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit('signal:ice-candidate', {
        fromSocketId: socket.id,
        candidate,
      });
    });

    // Broadcast ICE config to newly joined peer
    socket.on('signal:request-ice-config', (callback) => {
      callback?.({
        iceServers: getIceServers(),
      });
    });

    // ─── MEDIA STATE ─────────────────────────────────────────────────────────

    socket.on('media:toggle-video', ({ enabled }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      const room = activeRooms.get(roomId);
      if (room) {
        const p = room.participants.find(p => p.socketId === socket.id);
        if (p) p.videoEnabled = enabled;
      }
      socket.to(roomId).emit('media:participant-video', {
        socketId: socket.id,
        userId: socket.userId,
        enabled,
      });
    });

    socket.on('media:toggle-audio', ({ enabled }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      const room = activeRooms.get(roomId);
      if (room) {
        const p = room.participants.find(p => p.socketId === socket.id);
        if (p) p.audioEnabled = enabled;
      }
      socket.to(roomId).emit('media:participant-audio', {
        socketId: socket.id,
        userId: socket.userId,
        enabled,
      });
    });

    // Host mutes a specific participant
    socket.on('media:mute-participant', ({ targetSocketId, type }) => {
      io.to(targetSocketId).emit('media:force-mute', { by: socket.userId, type }); // type: 'audio'|'video'|'both'
    });

    // ─── SCREEN SHARING ──────────────────────────────────────────────────────

    socket.on('screen:start', ({ type }) => {
      // type: 'screen' | 'window' | 'tab'
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      const room = activeRooms.get(roomId);
      if (room) {
        if (room.screensharer && room.screensharer !== socket.id) {
          socket.emit('screen:error', { message: 'Someone is already sharing their screen' });
          return;
        }
        room.screensharer = socket.id;
      }
      socket.to(roomId).emit('screen:started', {
        socketId: socket.id,
        userId: socket.userId,
        userName: socket.userName,
        type,
      });
    });

    socket.on('screen:stop', () => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      const room = activeRooms.get(roomId);
      if (room && room.screensharer === socket.id) {
        room.screensharer = null;
      }
      socket.to(roomId).emit('screen:stopped', {
        socketId: socket.id,
        userId: socket.userId,
      });
    });

    // ─── CHAT ────────────────────────────────────────────────────────────────

    socket.on('chat:send', async (data, callback) => {
      try {
        const roomId = socketToRoom.get(socket.id);
        if (!roomId) return callback?.({ success: false, error: 'Not in a room' });

        const { content, type = 'text', replyTo, fileUrl, fileName, fileSize } = data;

        if (!content && type === 'text') return callback?.({ success: false, error: 'Content required' });

        const room = activeRooms.get(roomId);
        const msgId = uuidv4();
        const timestamp = new Date();

        const message = {
          id: msgId,
          roomId,
          senderId: socket.userId,
          senderName: socket.userName,
          senderRole: socket.userRole,
          content,
          type,
          replyTo,
          fileUrl,
          fileName,
          fileSize,
          timestamp,
          reactions: [],
        };

        // Persist to DB async
        saveChatMessage(room?.dbRoomId, room?.sessionId, socket.userId, socket.userName, socket.userRole, {
          content, type, replyTo, fileUrl, fileName, fileSize, timestamp
        });

        // Cache in Redis for quick retrieval
        const cacheKey = `chat:${roomId}`;
        const existing = await cache.get(cacheKey) || [];
        existing.push(message);
        if (existing.length > 500) existing.shift(); // keep last 500
        await cache.set(cacheKey, existing, 86400); // 24hrs

        io.to(roomId).emit('chat:message', message);
        callback?.({ success: true, id: msgId });

      } catch (err) {
        logger.error('chat:send error:', err);
        callback?.({ success: false, error: 'Failed to send message' });
      }
    });

    socket.on('chat:react', async ({ messageId, emoji }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      io.to(roomId).emit('chat:reaction', {
        messageId,
        emoji,
        userId: socket.userId,
        userName: socket.userName,
      });
    });

    socket.on('chat:delete', async ({ messageId }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      io.to(roomId).emit('chat:message-deleted', { messageId, by: socket.userId });
    });

    socket.on('chat:pin', ({ messageId }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      io.to(roomId).emit('chat:message-pinned', { messageId, by: socket.userId, byName: socket.userName });
    });

    socket.on('chat:history', async (callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback?.([]);
      const cacheKey = `chat:${roomId}`;
      const messages = await cache.get(cacheKey) || [];
      callback?.(messages);
    });

    socket.on('chat:typing', ({ isTyping }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      socket.to(roomId).emit('chat:user-typing', {
        userId: socket.userId,
        userName: socket.userName,
        isTyping,
      });
    });

    // ─── LIVE CAPTIONS & TRANSCRIPTION ───────────────────────────────────────

    socket.on('caption:chunk', async ({ text, isFinal, language, confidence }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;

      const caption = {
        id: uuidv4(),
        speakerId: socket.userId,
        speakerName: socket.userName,
        text,
        isFinal,
        language: language || 'en',
        confidence,
        timestamp: Date.now(),
      };

      // Broadcast live caption to everyone in room
      io.to(roomId).emit('caption:live', caption);

      // Store final captions for transcript
      if (isFinal) {
        const room = activeRooms.get(roomId);
        if (room?.sessionId) {
          const { Transcript } = require('../models');
          await Transcript.findOneAndUpdate(
            { session: room.sessionId },
            {
              $push: {
                entries: {
                  speaker: socket.userId,
                  speakerName: socket.userName,
                  text,
                  confidence,
                  startTime: (Date.now() - room.startTime) / 1000,
                }
              },
              $inc: { wordCount: text.split(' ').length }
            },
            { upsert: true, new: true }
          );
        }
      }
    });

    // Client-side speech-to-text result relay
    socket.on('caption:result', ({ text, isFinal, speakerId }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      socket.to(roomId).emit('caption:live', {
        speakerId: speakerId || socket.userId,
        speakerName: socket.userName,
        text,
        isFinal,
        timestamp: Date.now(),
      });
    });

    // ─── RECORDING ───────────────────────────────────────────────────────────

    socket.on('recording:start', async ({ type = 'full' }, callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback?.({ success: false, error: 'Not in a room' });

      const room = activeRooms.get(roomId);
      if (room?.isRecording) return callback?.({ success: false, error: 'Already recording' });

      const { Recording } = require('../models');
      const recording = await Recording.create({
        room: room.dbRoomId,
        session: room.sessionId,
        startedBy: socket.userId,
        startedAt: new Date(),
        type,
        status: 'recording',
        participants: room.participants.map(p => p.name),
      });

      if (room) {
        room.isRecording = true;
        room.recordingId = recording._id.toString();
      }

      // Notify all participants
      io.to(roomId).emit('recording:started', {
        by: socket.userId,
        byName: socket.userName,
        recordingId: recording._id,
        type,
        startedAt: recording.startedAt,
      });

      callback?.({ success: true, recordingId: recording._id });
    });

    socket.on('recording:stop', async (callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;

      const room = activeRooms.get(roomId);
      if (!room?.isRecording) return callback?.({ success: false, error: 'Not recording' });

      const { Recording } = require('../models');
      const endedAt = new Date();
      const duration = room.startTime ? (endedAt - new Date(room.startTime)) / 1000 : 0;

      await Recording.findByIdAndUpdate(room.recordingId, {
        status: 'processing',
        endedAt,
        duration,
      });

      room.isRecording = false;

      io.to(roomId).emit('recording:stopped', {
        by: socket.userId,
        byName: socket.userName,
        recordingId: room.recordingId,
        duration,
      });

      callback?.({ success: true });
      delete room.recordingId;
    });

    // Recording chunk from client (for server-side recording without MediaRecorder API)
    socket.on('recording:chunk', ({ chunk, mimeType }) => {
      // In production: pipe chunks to a writable stream (file or cloud storage)
      // This is handled by the RecordingService
    });

    // ─── DOCUMENT SHARING ────────────────────────────────────────────────────

    socket.on('document:share', async ({ documentId }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;

      const { Document } = require('../models');
      const doc = await Document.findById(documentId);
      if (!doc) return;

      doc.isShared = true;
      doc.sharedAt = new Date();
      doc.sharedBy = socket.userId;
      await doc.save();

      io.to(roomId).emit('document:shared', {
        documentId,
        name: doc.name,
        url: doc.url,
        type: doc.type,
        mimeType: doc.mimeType,
        pageCount: doc.pageCount,
        sharedBy: socket.userId,
        sharedByName: socket.userName,
      });
    });

    socket.on('document:page-change', ({ documentId, page }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      socket.to(roomId).emit('document:page-changed', { documentId, page, by: socket.userId });
    });

    socket.on('document:annotate', ({ documentId, annotation }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      io.to(roomId).emit('document:annotation', {
        documentId,
        annotation: { ...annotation, by: socket.userId, byName: socket.userName },
      });
    });

    socket.on('document:unshare', ({ documentId }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      io.to(roomId).emit('document:unshared', { documentId, by: socket.userId });
    });

    // ─── WHITEBOARD ──────────────────────────────────────────────────────────

    socket.on('whiteboard:draw', (data) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      socket.to(roomId).emit('whiteboard:draw', { ...data, by: socket.userId });
    });

    socket.on('whiteboard:clear', () => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      io.to(roomId).emit('whiteboard:cleared', { by: socket.userId, byName: socket.userName });
    });

    // ─── POLLS ───────────────────────────────────────────────────────────────

    socket.on('poll:create', async (pollData, callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;

      const { Poll } = require('../models');
      const room = activeRooms.get(roomId);

      const poll = await Poll.create({
        room: room?.dbRoomId,
        session: room?.sessionId,
        createdBy: socket.userId,
        question: pollData.question,
        options: pollData.options.map(text => ({ text, votes: [], count: 0 })),
        isAnonymous: pollData.isAnonymous || false,
        isMultiChoice: pollData.isMultiChoice || false,
      });

      io.to(roomId).emit('poll:new', {
        pollId: poll._id,
        question: poll.question,
        options: poll.options.map(o => ({ id: o._id, text: o.text, count: 0 })),
        createdBy: socket.userId,
        createdByName: socket.userName,
        isAnonymous: poll.isAnonymous,
        isMultiChoice: poll.isMultiChoice,
      });

      callback?.({ success: true, pollId: poll._id });
    });

    socket.on('poll:vote', async ({ pollId, optionIds }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;

      const { Poll } = require('../models');
      const poll = await Poll.findById(pollId);
      if (!poll || poll.status !== 'active') return;

      // Add votes
      for (const optionId of optionIds) {
        const option = poll.options.id(optionId);
        if (option && !option.votes.includes(socket.userId)) {
          option.votes.push(socket.userId);
          option.count++;
          poll.totalVotes++;
        }
      }
      await poll.save();

      io.to(roomId).emit('poll:updated', {
        pollId,
        options: poll.options.map(o => ({ id: o._id, text: o.text, count: o.count })),
        totalVotes: poll.totalVotes,
      });
    });

    socket.on('poll:end', async ({ pollId }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      const { Poll } = require('../models');
      await Poll.findByIdAndUpdate(pollId, { status: 'ended', endedAt: new Date() });
      io.to(roomId).emit('poll:ended', { pollId });
    });

    // ─── REACTIONS ───────────────────────────────────────────────────────────

    socket.on('reaction:send', ({ emoji }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      io.to(roomId).emit('reaction:received', {
        emoji,
        userId: socket.userId,
        userName: socket.userName,
        id: uuidv4(),
      });
    });

    socket.on('hand:raise', ({ raised }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      const room = activeRooms.get(roomId);
      if (room) {
        const p = room.participants.find(p => p.socketId === socket.id);
        if (p) p.handRaised = raised;
      }
      io.to(roomId).emit('hand:status', {
        userId: socket.userId,
        userName: socket.userName,
        raised,
      });
    });

    // ─── BREAKOUT ROOMS ──────────────────────────────────────────────────────

    socket.on('breakout:create', async ({ rooms: breakoutConfig }, callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;

      const { BreakoutRoom } = require('../models');
      const room = activeRooms.get(roomId);
      const createdRooms = [];

      for (const config of breakoutConfig) {
        const bRoomId = `breakout-${uuidv4().slice(0, 8)}`;
        const breakout = await BreakoutRoom.create({
          parentRoom: room.dbRoomId,
          session: room.sessionId,
          name: config.name,
          roomId: bRoomId,
          host: socket.userId,
          participants: config.participantIds || [],
          startedAt: new Date(),
        });

        createdRooms.push({
          id: breakout._id,
          roomId: bRoomId,
          name: config.name,
          participants: config.participantIds || [],
        });
      }

      io.to(roomId).emit('breakout:rooms-created', { rooms: createdRooms });
      callback?.({ success: true, rooms: createdRooms });
    });

    socket.on('breakout:assign', ({ userId, breakoutRoomId }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      const room = activeRooms.get(roomId);
      const target = room?.participants.find(p => p.userId === userId);
      if (target) {
        io.to(target.socketId).emit('breakout:assigned', { breakoutRoomId });
      }
    });

    socket.on('breakout:close-all', () => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      io.to(roomId).emit('breakout:all-closed', { by: socket.userId });
    });

    // ─── HOST CONTROLS ────────────────────────────────────────────────────────

    socket.on('participant:kick', ({ targetSocketId, reason }) => {
      io.to(targetSocketId).emit('participant:kicked', { reason: reason || 'Removed by host' });
      io.sockets.sockets.get(targetSocketId)?.leave(socketToRoom.get(targetSocketId));
    });

    socket.on('room:lock', ({ locked }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      const room = activeRooms.get(roomId);
      if (room) room.isLocked = locked;
      io.to(roomId).emit('room:lock-status', { locked, by: socket.userId });
    });

    socket.on('room:end', async () => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      io.to(roomId).emit('room:ended', { by: socket.userId, byName: socket.userName });

      // End all sockets in room
      const room = activeRooms.get(roomId);
      if (room) {
        await endSession(roomId, room);
      }
    });

    // ─── LIVE STREAM ─────────────────────────────────────────────────────────

    socket.on('stream:go-live', ({ title, description }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      io.to(roomId).emit('stream:live', {
        hostId: socket.userId,
        hostName: socket.userName,
        title,
        description,
        startedAt: new Date(),
      });
    });

    socket.on('stream:viewer-count', ({ count }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      socket.to(roomId).emit('stream:viewer-update', { count });
    });

    // ─── NETWORK QUALITY ────────────────────────────────────────────────────

    socket.on('network:stats', ({ stats }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      socket.to(roomId).emit('network:participant-stats', {
        userId: socket.userId,
        stats, // { bandwidth, latency, packetLoss, quality: 'excellent'|'good'|'poor' }
      });
    });

    // ─── SPOTLIGHT ──────────────────────────────────────────────────────────

    socket.on('spotlight:pin', ({ targetUserId }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      io.to(roomId).emit('spotlight:pinned', { targetUserId, by: socket.userId });
    });

    socket.on('spotlight:unpin', () => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      io.to(roomId).emit('spotlight:unpinned', { by: socket.userId });
    });
  });

  // ─── Helper: Join Room ───────────────────────────────────────────────────────

  async function joinRoom(socket, io, room, { displayName, videoEnabled, audioEnabled, callback }) {
    const roomId = room.roomId;

    socket.join(roomId);
    socketToRoom.set(socket.id, roomId);

    // Get or create room state
    if (!activeRooms.has(roomId)) {
      // Create/resume session
      let session;
      const existingSession = await Session.findOne({ room: room._id, endedAt: null });

      if (existingSession) {
        session = existingSession;
      } else {
        session = await Session.create({
          room: room._id,
          startedAt: new Date(),
        });

        // Mark room as active
        await Room.findByIdAndUpdate(room._id, {
          status: 'active',
          startedAt: room.startedAt || new Date(),
        });
      }

      activeRooms.set(roomId, {
        dbRoomId: room._id,
        sessionId: session._id,
        startTime: Date.now(),
        participants: [],
        isRecording: false,
        screensharer: null,
        isLocked: false,
        host: room.host._id.toString(),
      });
    }

    const roomState = activeRooms.get(roomId);

    // Check if room is locked
    if (roomState.isLocked && roomState.host !== socket.userId) {
      socket.leave(roomId);
      socketToRoom.delete(socket.id);
      return callback?.({ success: false, error: 'Room is locked' });
    }

    // Check capacity
    if (roomState.participants.length >= room.maxParticipants) {
      socket.leave(roomId);
      socketToRoom.delete(socket.id);
      return callback?.({ success: false, error: 'Room is at maximum capacity' });
    }

    const participant = {
      socketId: socket.id,
      userId: socket.userId,
      name: displayName || socket.userName,
      role: socket.userRole || 'student',
      videoEnabled: videoEnabled !== false,
      audioEnabled: audioEnabled !== false,
      handRaised: false,
      joinedAt: Date.now(),
    };

    roomState.participants.push(participant);
    roomState.participantCount = (roomState.participantCount || 0) + 1;

    // Get existing participants to return to new joiner
    const existingParticipants = roomState.participants
      .filter(p => p.socketId !== socket.id)
      .map(p => ({
        socketId: p.socketId,
        userId: p.userId,
        name: p.name,
        role: p.role,
        videoEnabled: p.videoEnabled,
        audioEnabled: p.audioEnabled,
        handRaised: p.handRaised,
      }));

    // Notify existing participants of new joiner
    socket.to(roomId).emit('participant:joined', {
      socketId: socket.id,
      userId: socket.userId,
      name: participant.name,
      role: participant.role,
      videoEnabled: participant.videoEnabled,
      audioEnabled: participant.audioEnabled,
    });

    // Get recent chat history
    const chatHistory = await cache.get(`chat:${roomId}`) || [];

    callback?.({
      success: true,
      roomId,
      sessionId: roomState.sessionId,
      participants: existingParticipants,
      chatHistory: chatHistory.slice(-100), // last 100 messages
      isRecording: roomState.isRecording,
      screensharer: roomState.screensharer,
      iceServers: getIceServers(),
      roomSettings: room.settings,
    });

    logger.info(`${participant.name} joined room ${roomId} (${roomState.participants.length} participants)`);
  }

  // ─── Helper: Leave Room ──────────────────────────────────────────────────────

  async function handleLeave(socket, io) {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;

    socketToRoom.delete(socket.id);
    socket.leave(roomId);

    const room = activeRooms.get(roomId);
    if (!room) return;

    const participantIdx = room.participants.findIndex(p => p.socketId === socket.id);
    const participant = room.participants[participantIdx];

    if (participantIdx !== -1) {
      room.participants.splice(participantIdx, 1);
    }

    // If screensharer left, clear it
    if (room.screensharer === socket.id) {
      room.screensharer = null;
      io.to(roomId).emit('screen:stopped', { socketId: socket.id, userId: socket.userId });
    }

    io.to(roomId).emit('participant:left', {
      socketId: socket.id,
      userId: socket.userId,
      name: participant?.name,
    });

    logger.info(`${participant?.name} left room ${roomId} (${room.participants.length} remaining)`);

    // If room is empty, end the session
    if (room.participants.length === 0) {
      await endSession(roomId, room);
    }
  }

  async function endSession(roomId, room) {
    try {
      const endedAt = new Date();
      const duration = room.startTime ? Math.round((Date.now() - room.startTime) / 1000) : 0;

      await Session.findByIdAndUpdate(room.sessionId, {
        endedAt,
        duration,
        participantCount: room.participantCount || 0,
        peakParticipants: room.participantCount || 0,
      });

      await Room.findByIdAndUpdate(room.dbRoomId, {
        status: 'ended',
        endedAt,
        duration: Math.round(duration / 60),
      });

      activeRooms.delete(roomId);
      await cache.del(`chat:${roomId}`);

      logger.info(`Session ended for room ${roomId}, duration: ${duration}s`);
    } catch (err) {
      logger.error('Error ending session:', err);
    }
  }
}

// ─── ICE Servers Config ───────────────────────────────────────────────────────

function getIceServers() {
  return [
    { urls: process.env.STUN_SERVER || 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    ...(process.env.TURN_SERVER ? [{
      urls: process.env.TURN_SERVER,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD,
    }] : []),
  ];
}

// ─── DB Helpers (async, non-blocking) ────────────────────────────────────────

async function saveChatMessage(roomId, sessionId, senderId, senderName, senderRole, data) {
  try {
    if (!roomId) return;
    await ChatMessage.create({
      room: roomId,
      session: sessionId,
      sender: senderId,
      senderName,
      senderRole,
      content: data.content,
      type: data.type,
      replyTo: data.replyTo,
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      fileSize: data.fileSize,
      timestamp: data.timestamp,
    });
  } catch (err) {
    logger.error('Failed to save chat message:', err);
  }
}

module.exports = { setupSocketIO, getIceServers };
