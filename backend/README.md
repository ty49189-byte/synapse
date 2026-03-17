# 🎥 MeetLink Connect — Backend

> **Production-grade WebRTC collaboration platform backend** for real-time video, chat, screen sharing, live captions, translation, recording, and remote learning.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    MeetLink Backend Stack                    │
├──────────────┬──────────────┬───────────────┬───────────────┤
│  Express.js  │  Socket.IO   │  Mediasoup    │   MongoDB     │
│  REST API    │  WebSockets  │  SFU (P2P+)   │   Database    │
├──────────────┴──────────────┴───────────────┴───────────────┤
│                         Redis                                │
│           (Caching · Pub/Sub · Session Store)               │
└─────────────────────────────────────────────────────────────┘
```

### WebRTC Strategy
- **≤6 participants**: Direct P2P via ICE/STUN/TURN (ultra-low latency)
- **7–100 participants**: Mediasoup SFU (Selective Forwarding Unit)
- **Live Streams**: RTMP ingest → HLS playback

---

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- MongoDB 7.x
- Redis 7.x
- (Optional) Python3, make, g++ for Mediasoup native build

### 1. Clone & Install

```bash
git clone <your-backend-repo>
cd meetlink-backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values
```

**Minimum required variables:**
```env
JWT_SECRET=your_min_32_char_secret_here
MONGODB_URI=mongodb://localhost:27017/meetlink
CLIENT_ORIGIN=http://localhost:3000
```

### 3. Start Development Server

```bash
npm run dev
```

Server starts at `http://localhost:5000`

### 4. Docker (Recommended for Production)

```bash
# Copy and fill in your env vars
cp .env.example .env.production

# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f backend
```

---

## 📡 API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, get JWT tokens |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Logout (invalidate token) |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/guest-token` | Get guest session token |

### Rooms

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/rooms` | Create room |
| POST | `/api/rooms/instant` | Create instant meeting |
| GET | `/api/rooms` | List user's rooms |
| GET | `/api/rooms/:roomId` | Get room details |
| PATCH | `/api/rooms/:roomId` | Update room settings |
| DELETE | `/api/rooms/:roomId` | Delete room |
| GET | `/api/rooms/:roomId/sessions` | Session history |
| GET | `/api/rooms/:roomId/participants` | Participants list |
| POST | `/api/rooms/:roomId/co-host` | Add co-host |

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chat/:roomId/history` | Get chat history |
| GET | `/api/chat/:roomId/export?format=txt\|json` | Export chat |
| GET | `/api/chat/:roomId/search?q=term` | Search messages |
| PATCH | `/api/chat/:messageId` | Edit message |
| DELETE | `/api/chat/:messageId` | Delete message |
| POST | `/api/chat/:messageId/react` | React to message |

### Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/documents/upload` | Upload document |
| POST | `/api/documents/upload-multiple` | Upload multiple |
| GET | `/api/documents` | List documents |
| GET | `/api/documents/:id` | Get document |
| GET | `/api/documents/:id/download` | Download file |
| POST | `/api/documents/:id/annotate` | Add annotation |
| DELETE | `/api/documents/:id` | Delete document |
| GET | `/api/documents/room/:roomId` | Room documents |

### Recordings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/recordings` | List recordings |
| GET | `/api/recordings/:id` | Get recording |
| POST | `/api/recordings/upload` | Upload recording file |
| GET | `/api/recordings/:id/download` | Download recording |
| PATCH | `/api/recordings/:id` | Update/share recording |
| DELETE | `/api/recordings/:id` | Delete recording |
| GET | `/api/recordings/room/:roomId` | Room recordings |

### Captions & Transcription

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/captions/:roomId/transcript` | Get transcript |
| GET | `/api/captions/:roomId/transcripts` | All transcripts |
| POST | `/api/captions/transcribe-chunk` | Transcribe audio |
| GET | `/api/captions/transcript/:id/export?format=txt\|srt\|vtt\|json` | Export |
| DELETE | `/api/captions/transcript/:id` | Delete transcript |

### Translation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/translation/languages` | Supported languages (28+) |
| POST | `/api/translation/translate` | Translate text |
| POST | `/api/translation/translate-batch` | Batch translate |
| POST | `/api/translation/detect` | Detect language |
| POST | `/api/translation/translate-chat/:messageId` | Translate message |
| POST | `/api/translation/translate-caption` | Translate caption live |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/dashboard` | User dashboard stats |
| GET | `/api/analytics/room/:roomId` | Room analytics |
| GET | `/api/analytics/admin` | Admin overview |

---

## 🔌 Socket.IO Events

### Client → Server (emit)

```javascript
// Room
socket.emit('room:join', { roomId, password, displayName, videoEnabled, audioEnabled }, callback)
socket.emit('room:leave')
socket.emit('room:end')          // Host only
socket.emit('room:lock', { locked })

// WebRTC Signaling
socket.emit('signal:offer', { targetSocketId, offer, metadata })
socket.emit('signal:answer', { targetSocketId, answer })
socket.emit('signal:ice-candidate', { targetSocketId, candidate })
socket.emit('signal:request-ice-config', callback)

// Media
socket.emit('media:toggle-video', { enabled })
socket.emit('media:toggle-audio', { enabled })
socket.emit('media:mute-participant', { targetSocketId, type }) // host only

// Screen
socket.emit('screen:start', { type }) // type: 'screen'|'window'|'tab'
socket.emit('screen:stop')

// Chat
socket.emit('chat:send', { content, type, replyTo }, callback)
socket.emit('chat:react', { messageId, emoji })
socket.emit('chat:delete', { messageId })
socket.emit('chat:pin', { messageId })
socket.emit('chat:typing', { isTyping })
socket.emit('chat:history', callback)

// Captions
socket.emit('caption:chunk', { text, isFinal, language, confidence })

// Recording
socket.emit('recording:start', { type }, callback)
socket.emit('recording:stop', callback)

// Documents
socket.emit('document:share', { documentId })
socket.emit('document:page-change', { documentId, page })
socket.emit('document:annotate', { documentId, annotation })
socket.emit('document:unshare', { documentId })

// Polls
socket.emit('poll:create', { question, options, isAnonymous }, callback)
socket.emit('poll:vote', { pollId, optionIds })
socket.emit('poll:end', { pollId })

// Reactions & Engagement
socket.emit('reaction:send', { emoji })
socket.emit('hand:raise', { raised })

// Breakout Rooms
socket.emit('breakout:create', { rooms: [{ name, participantIds }] }, callback)
socket.emit('breakout:assign', { userId, breakoutRoomId })
socket.emit('breakout:close-all')

// Participant Controls (Host)
socket.emit('participant:kick', { targetSocketId, reason })
socket.emit('spotlight:pin', { targetUserId })
socket.emit('spotlight:unpin')

// Waiting Room
socket.emit('waiting-room:admit', { socketId, userId })
socket.emit('waiting-room:deny', { socketId })

// Network
socket.emit('network:stats', { stats })
```

### Server → Client (listen)

```javascript
// Participants
socket.on('participant:joined', ({ socketId, userId, name, role, videoEnabled, audioEnabled }))
socket.on('participant:left', ({ socketId, userId, name }))
socket.on('participant:kicked', ({ reason }))

// WebRTC
socket.on('signal:offer', ({ fromSocketId, offer, metadata }))
socket.on('signal:answer', ({ fromSocketId, answer }))
socket.on('signal:ice-candidate', ({ fromSocketId, candidate }))

// Media
socket.on('media:participant-video', ({ socketId, userId, enabled }))
socket.on('media:participant-audio', ({ socketId, userId, enabled }))
socket.on('media:force-mute', ({ by, type }))

// Screen
socket.on('screen:started', ({ socketId, userId, userName, type }))
socket.on('screen:stopped', ({ socketId, userId }))
socket.on('screen:error', ({ message }))

// Chat
socket.on('chat:message', ({ id, senderId, senderName, content, type, timestamp }))
socket.on('chat:reaction', ({ messageId, emoji, userId }))
socket.on('chat:message-deleted', ({ messageId, by }))
socket.on('chat:message-pinned', ({ messageId, by }))
socket.on('chat:user-typing', ({ userId, userName, isTyping }))

// Captions
socket.on('caption:live', ({ speakerId, speakerName, text, isFinal, language, confidence }))

// Recording
socket.on('recording:started', ({ by, byName, recordingId, type, startedAt }))
socket.on('recording:stopped', ({ by, recordingId, duration }))

// Documents
socket.on('document:shared', ({ documentId, name, url, type, sharedBy }))
socket.on('document:page-changed', ({ documentId, page, by }))
socket.on('document:annotation', ({ documentId, annotation }))
socket.on('document:unshared', ({ documentId, by }))

// Polls
socket.on('poll:new', ({ pollId, question, options, createdBy }))
socket.on('poll:updated', ({ pollId, options, totalVotes }))
socket.on('poll:ended', ({ pollId }))

// Reactions
socket.on('reaction:received', ({ emoji, userId, userName, id }))
socket.on('hand:status', ({ userId, userName, raised }))

// Room
socket.on('room:ended', ({ by, byName }))
socket.on('room:lock-status', ({ locked, by }))

// Breakout
socket.on('breakout:rooms-created', ({ rooms }))
socket.on('breakout:assigned', ({ breakoutRoomId }))
socket.on('breakout:all-closed', { by })

// Waiting Room
socket.on('waiting-room:admitted')
socket.on('waiting-room:denied', ({ reason }))
socket.on('waiting-room:participant-waiting', ({ socketId, userId, name }))

// Spotlight
socket.on('spotlight:pinned', ({ targetUserId, by }))
socket.on('spotlight:unpinned', ({ by }))

// Network
socket.on('network:participant-stats', ({ userId, stats }))

// Stream
socket.on('stream:live', ({ hostId, hostName, title, startedAt }))
socket.on('stream:viewer-update', ({ count }))
```

---

## 🎯 Frontend Integration

### Step 1 — Install Socket.IO Client

```bash
npm install socket.io-client
```

### Step 2 — Copy the Client Helper

Copy `src/utils/meetlinkClient.js` into your frontend project:

```bash
cp src/utils/meetlinkClient.js ../meetlink-frontend/src/lib/meetlink.js
```

### Step 3 — Basic React Usage

```jsx
import { useEffect, useRef, useState } from 'react';
import { MeetLinkClient, MeetLinkAPI } from './lib/meetlink';

export function VideoRoom({ roomId, token }) {
  const clientRef = useRef(null);
  const [participants, setParticipants] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [captions, setCaptions] = useState([]);
  const [chat, setChat] = useState([]);

  useEffect(() => {
    const client = new MeetLinkClient({
      serverUrl: import.meta.env.VITE_API_URL || 'http://localhost:5000',
      token,
    });
    clientRef.current = client;

    // Event listeners
    client.on('participant:joined', (p) => {
      setParticipants(prev => [...prev, p]);
    });

    client.on('participant:left', ({ socketId }) => {
      setParticipants(prev => prev.filter(p => p.socketId !== socketId));
      setRemoteStreams(prev => { const n = {...prev}; delete n[socketId]; return n; });
    });

    client.on('peer:stream', ({ socketId, stream, name }) => {
      setRemoteStreams(prev => ({ ...prev, [socketId]: { stream, name } }));
    });

    client.on('caption:live', (caption) => {
      setCaptions(prev => {
        const filtered = prev.filter(c => c.speakerId !== caption.speakerId || c.isFinal);
        return [...filtered.slice(-10), caption];
      });
    });

    client.on('chat:message', (msg) => {
      setChat(prev => [...prev, msg]);
    });

    // Join the room
    client.joinRoom(roomId, { displayName: 'Your Name', videoEnabled: true, audioEnabled: true })
      .then((response) => {
        setLocalStream(client.localStream);
        setParticipants(response.participants);
        setChat(response.chatHistory);
        client.startCaptions('en-US'); // Start live captions
        client.startNetworkMonitoring(); // Monitor quality
      });

    return () => client.disconnect();
  }, [roomId, token]);

  return (
    <div className="video-grid">
      {/* Local video */}
      <video
        ref={(el) => { if (el && localStream) el.srcObject = localStream; }}
        autoPlay muted playsInline
      />

      {/* Remote videos */}
      {Object.entries(remoteStreams).map(([socketId, { stream, name }]) => (
        <div key={socketId}>
          <video
            ref={(el) => { if (el && stream) el.srcObject = stream; }}
            autoPlay playsInline
          />
          <span>{name}</span>
        </div>
      ))}

      {/* Live captions */}
      <div className="captions">
        {captions.map((c, i) => (
          <div key={i} className={c.isFinal ? 'final' : 'interim'}>
            <strong>{c.speakerName}:</strong> {c.text}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="controls">
        <button onClick={() => clientRef.current?.toggleAudio(false)}>Mute</button>
        <button onClick={() => clientRef.current?.toggleVideo(false)}>Stop Video</button>
        <button onClick={() => clientRef.current?.startScreenShare()}>Share Screen</button>
        <button onClick={() => clientRef.current?.startRecording()}>Record</button>
        <button onClick={() => clientRef.current?.sendMessage('Hello!')}>Send Chat</button>
        <button onClick={() => clientRef.current?.raiseHand()}>✋ Raise Hand</button>
        <button onClick={() => clientRef.current?.leaveRoom()}>Leave</button>
      </div>
    </div>
  );
}
```

### Step 4 — Environment Variables (Frontend)

```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

---

## 🌍 Supported Translation Languages (28+)

English, Spanish, French, German, Italian, Portuguese, Russian, Chinese,
Japanese, Korean, Arabic, Hindi, Dutch, Polish, Turkish, Swedish, Danish,
Finnish, Norwegian, Czech, Ukrainian, Thai, Vietnamese, Indonesian, Malay,
Bengali, Urdu, Persian

### Translation Providers (configure in `.env`)
- **Google Translate** (best quality, paid)
- **DeepL** (excellent European languages, has free tier)
- **LibreTranslate** (open source, self-hostable, free)

### Speech-to-Text Providers
- **Browser Web Speech API** (free, client-side, Chrome/Edge)
- **Google Speech-to-Text** (paid, high accuracy)
- **Deepgram** (paid, very fast, speaker diarization)
- **AssemblyAI** (paid, excellent accuracy)

---

## 🔧 Production Checklist

- [ ] Set strong `JWT_SECRET` (min 32 chars)
- [ ] Configure TURN server (required for users behind strict NAT/firewalls)
- [ ] Set `MEDIASOUP_ANNOUNCED_IP` to your server's public IP
- [ ] Configure translation/STT API keys
- [ ] Set up SSL/TLS (required for WebRTC in production)
- [ ] Configure `CLIENT_ORIGIN` to your frontend domain
- [ ] Set up MongoDB authentication
- [ ] Set up Redis password
- [ ] Configure file upload limits and storage
- [ ] Set up log rotation
- [ ] Enable firewall: open UDP/TCP 40000-49999 for Mediasoup

### Free TURN Server (Testing)
Use [Metered.ca](https://www.metered.ca/tools/openrelay/) for free TURN:
```env
TURN_SERVER=turn:openrelay.metered.ca:80
TURN_USERNAME=openrelayproject
TURN_PASSWORD=openrelayproject
```

---

## 📁 Project Structure

```
meetlink-backend/
├── src/
│   ├── server.js              # Entry point
│   ├── config/
│   │   ├── database.js        # MongoDB connection
│   │   └── redis.js           # Redis connection + cache helpers
│   ├── middleware/
│   │   ├── auth.js            # JWT authentication
│   │   ├── errorHandler.js    # Global error handler
│   │   └── rateLimiter.js     # Rate limiting
│   ├── models/
│   │   └── index.js           # All Mongoose models
│   ├── routes/
│   │   ├── auth.js            # Auth endpoints
│   │   ├── rooms.js           # Room management
│   │   ├── sessions.js        # Session history
│   │   ├── chat.js            # Chat history & export
│   │   ├── documents.js       # Document upload & sharing
│   │   ├── recordings.js      # Recording management
│   │   ├── captions.js        # Transcription & captions
│   │   ├── translation.js     # Text & caption translation
│   │   ├── users.js           # User profiles
│   │   ├── streams.js         # Live streaming
│   │   └── analytics.js       # Usage analytics
│   ├── services/
│   │   ├── socketService.js   # Socket.IO signaling (CORE)
│   │   ├── mediasoupService.js# SFU for large calls
│   │   └── translationService.js # Translation + STT
│   └── utils/
│       ├── logger.js          # Winston logger
│       └── meetlinkClient.js  # Frontend integration helper
├── uploads/                   # File storage
│   ├── documents/
│   ├── recordings/
│   └── avatars/
├── logs/                      # Log files
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── .env.example
└── package.json
```

---

## 🤝 Integration with Lovable Frontend

Since your frontend was built with Lovable (Vite + React + Tailwind):

1. **Add the client helper**: `src/lib/meetlink.js`
2. **Set env vars** in your Lovable project settings:
   - `VITE_API_URL=https://your-backend.com`
3. **Socket.IO**: Already bundled in the helper — just `npm install socket.io-client`
4. **Auth flow**: Call `/api/auth/login` → store `accessToken` → pass to `MeetLinkClient`
5. **Room flow**: Call `/api/rooms` to create → navigate to room → call `client.joinRoom(roomId)`

---

*Built with ❤️ for real-time remote learning*
