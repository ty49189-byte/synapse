/**
 * MeetLink Connect - Frontend WebRTC Integration Utilities
 * 
 * Copy this file into your frontend project (src/lib/meetlink.js)
 * This provides the complete client-side WebRTC + Socket.IO integration.
 */

// ─── Socket.IO Client Setup ───────────────────────────────────────────────────
// npm install socket.io-client

/**
 * USAGE EXAMPLE (React):
 * 
 * import { MeetLinkClient } from './lib/meetlink';
 * 
 * const client = new MeetLinkClient({
 *   serverUrl: 'http://localhost:5000',
 *   token: 'your_jwt_token',
 * });
 * 
 * await client.joinRoom('abc-defg-hij', {
 *   displayName: 'John Doe',
 *   videoEnabled: true,
 *   audioEnabled: true,
 * });
 */

export class MeetLinkClient {
  constructor({ serverUrl, token }) {
    this.serverUrl = serverUrl;
    this.token = token;
    this.socket = null;
    this.localStream = null;
    this.screenStream = null;
    this.peers = new Map(); // socketId -> RTCPeerConnection
    this.iceServers = [];
    this.roomId = null;
    this.callbacks = {};
    this.captionRecognition = null;
  }

  // ─── Connect ─────────────────────────────────────────────────────────────

  async connect() {
    const { io } = await import('socket.io-client');
    this.socket = io(this.serverUrl, {
      auth: { token: this.token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    return new Promise((resolve, reject) => {
      this.socket.on('connect', () => {
        console.log('✅ Connected to MeetLink server');
        this._setupListeners();
        resolve();
      });
      this.socket.on('connect_error', reject);
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.localStream?.getTracks().forEach(t => t.stop());
    this.peers.forEach(peer => peer.close());
    this.peers.clear();
    if (this.captionRecognition) this.captionRecognition.stop();
  }

  // ─── Room ─────────────────────────────────────────────────────────────────

  async joinRoom(roomId, { displayName, videoEnabled = true, audioEnabled = true, password } = {}) {
    if (!this.socket) await this.connect();

    // Get local media
    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: videoEnabled ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : false,
      audio: audioEnabled ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
    });

    return new Promise((resolve, reject) => {
      this.socket.emit('room:join', { roomId, password, displayName, videoEnabled, audioEnabled }, async (response) => {
        if (!response.success) return reject(new Error(response.error));

        this.roomId = roomId;
        this.iceServers = response.iceServers || [];

        // Create peer connections to all existing participants
        for (const participant of response.participants) {
          await this._createPeerConnection(participant.socketId, true, participant);
        }

        resolve(response);
      });
    });
  }

  leaveRoom() {
    this.socket?.emit('room:leave');
    this.roomId = null;
    this.peers.forEach(pc => pc.close());
    this.peers.clear();
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
  }

  // ─── Media Controls ───────────────────────────────────────────────────────

  toggleVideo(enabled) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(t => t.enabled = enabled);
      this.socket?.emit('media:toggle-video', { enabled });
    }
  }

  toggleAudio(enabled) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => t.enabled = enabled);
      this.socket?.emit('media:toggle-audio', { enabled });
    }
  }

  async switchCamera(deviceId) {
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false,
    });
    const newVideoTrack = newStream.getVideoTracks()[0];
    const oldVideoTrack = this.localStream?.getVideoTracks()[0];

    if (oldVideoTrack) {
      this.localStream.removeTrack(oldVideoTrack);
      oldVideoTrack.stop();
    }
    this.localStream?.addTrack(newVideoTrack);

    // Replace track in all peer connections
    this.peers.forEach(async (pc) => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newVideoTrack);
    });
  }

  async switchMicrophone(deviceId) {
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } },
      video: false,
    });
    const newAudioTrack = newStream.getAudioTracks()[0];

    this.peers.forEach(async (pc) => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
      if (sender) await sender.replaceTrack(newAudioTrack);
    });
  }

  // ─── Screen Sharing ───────────────────────────────────────────────────────

  async startScreenShare(type = 'screen') {
    const displayMediaOptions = {
      video: { displaySurface: type, cursor: 'always', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: { echoCancellation: true, noiseSuppression: true },
      selfBrowserSurface: 'exclude',
    };

    this.screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
    const screenTrack = this.screenStream.getVideoTracks()[0];

    // Replace video track in all peers
    this.peers.forEach(async (pc) => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(screenTrack);
    });

    screenTrack.onended = () => this.stopScreenShare();
    this.socket?.emit('screen:start', { type });
    return this.screenStream;
  }

  async stopScreenShare() {
    if (!this.screenStream) return;
    this.screenStream.getTracks().forEach(t => t.stop());
    this.screenStream = null;

    // Restore camera
    const cameraTrack = this.localStream?.getVideoTracks()[0];
    if (cameraTrack) {
      this.peers.forEach(async (pc) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(cameraTrack);
      });
    }

    this.socket?.emit('screen:stop');
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────

  sendMessage(content, type = 'text', options = {}) {
    return new Promise((resolve, reject) => {
      this.socket?.emit('chat:send', { content, type, ...options }, (response) => {
        if (response?.success) resolve(response);
        else reject(new Error(response?.error || 'Failed to send'));
      });
    });
  }

  sendReaction(emoji) {
    this.socket?.emit('reaction:send', { emoji });
  }

  raiseHand(raised = true) {
    this.socket?.emit('hand:raise', { raised });
  }

  // ─── Live Captions (Web Speech API) ──────────────────────────────────────

  startCaptions(language = 'en-US') {
    if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
      console.warn('Speech Recognition not supported in this browser');
      return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.captionRecognition = new SpeechRecognition();
    this.captionRecognition.continuous = true;
    this.captionRecognition.interimResults = true;
    this.captionRecognition.lang = language;
    this.captionRecognition.maxAlternatives = 1;

    this.captionRecognition.onresult = (event) => {
      let interimText = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      if (interimText) {
        this.socket?.emit('caption:chunk', { text: interimText, isFinal: false, language, confidence: 0.5 });
        this._emit('caption:interim', { text: interimText });
      }
      if (finalText) {
        this.socket?.emit('caption:chunk', { text: finalText, isFinal: true, language, confidence: 0.9 });
        this._emit('caption:final', { text: finalText });
      }
    };

    this.captionRecognition.onerror = (e) => {
      if (e.error !== 'no-speech') console.error('Speech recognition error:', e.error);
    };

    this.captionRecognition.onend = () => {
      // Auto-restart if not manually stopped
      if (this.captionsActive) this.captionRecognition.start();
    };

    this.captionsActive = true;
    this.captionRecognition.start();
    return true;
  }

  stopCaptions() {
    this.captionsActive = false;
    this.captionRecognition?.stop();
    this.captionRecognition = null;
  }

  // ─── Recording (Client-side MediaRecorder) ────────────────────────────────

  async startRecording(options = {}) {
    const { type = 'full' } = options;

    let recordingStream;
    if (type === 'audio-only') {
      recordingStream = new MediaStream(this.localStream?.getAudioTracks() || []);
    } else {
      recordingStream = this.localStream;
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';

    this.mediaRecorder = new MediaRecorder(recordingStream, { mimeType });
    this.recordingChunks = [];

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordingChunks.push(e.data);
    };

    this.mediaRecorder.start(1000); // collect chunks every 1s

    // Notify server
    return new Promise((resolve) => {
      this.socket?.emit('recording:start', { type }, resolve);
    });
  }

  async stopRecording() {
    return new Promise((resolve) => {
      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.recordingChunks, { type: 'video/webm' });
        this.recordingChunks = [];

        // Upload to server
        const formData = new FormData();
        formData.append('recording', blob, `recording-${Date.now()}.webm`);
        if (this.roomId) formData.append('roomId', this.roomId);

        const response = await fetch(`${this.serverUrl}/api/recordings/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.token}` },
          body: formData,
        });

        const data = await response.json();
        resolve(data);
      };

      this.mediaRecorder.stop();
      this.socket?.emit('recording:stop');
    });
  }

  // ─── Device Enumeration ───────────────────────────────────────────────────

  static async getDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      cameras: devices.filter(d => d.kind === 'videoinput'),
      microphones: devices.filter(d => d.kind === 'audioinput'),
      speakers: devices.filter(d => d.kind === 'audiooutput'),
    };
  }

  static async testMicrophone() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    return {
      stream,
      analyser,
      stop: () => {
        stream.getTracks().forEach(t => t.stop());
        audioContext.close();
      }
    };
  }

  // ─── Network Quality Monitor ──────────────────────────────────────────────

  startNetworkMonitoring(intervalMs = 5000) {
    this._networkInterval = setInterval(async () => {
      const stats = await this._collectNetworkStats();
      this.socket?.emit('network:stats', { stats });
      this._emit('network:quality', stats);
    }, intervalMs);
  }

  stopNetworkMonitoring() {
    clearInterval(this._networkInterval);
  }

  async _collectNetworkStats() {
    if (this.peers.size === 0) return { quality: 'unknown' };

    const peer = this.peers.values().next().value;
    const reports = await peer.getStats();
    let rtt = 0, packetsLost = 0, packetsSent = 0;

    reports.forEach(report => {
      if (report.type === 'remote-inbound-rtp') {
        rtt = (report.roundTripTime || 0) * 1000;
        packetsLost += report.packetsLost || 0;
      }
      if (report.type === 'outbound-rtp') {
        packetsSent += report.packetsSent || 0;
      }
    });

    const packetLossRate = packetsSent > 0 ? (packetsLost / packetsSent) * 100 : 0;
    const quality = rtt < 100 && packetLossRate < 1 ? 'excellent'
      : rtt < 200 && packetLossRate < 3 ? 'good'
      : rtt < 400 ? 'fair' : 'poor';

    return { rtt: Math.round(rtt), packetLossRate: Math.round(packetLossRate * 10) / 10, quality };
  }

  // ─── Event System ─────────────────────────────────────────────────────────

  on(event, callback) {
    if (!this.callbacks[event]) this.callbacks[event] = [];
    this.callbacks[event].push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    this.callbacks[event] = (this.callbacks[event] || []).filter(cb => cb !== callback);
  }

  _emit(event, data) {
    (this.callbacks[event] || []).forEach(cb => cb(data));
  }

  // ─── Internal: WebRTC Peer Connection ────────────────────────────────────

  async _createPeerConnection(targetSocketId, isInitiator, participantInfo = {}) {
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 10,
    });

    this.peers.set(targetSocketId, pc);

    // Add local tracks
    this.localStream?.getTracks().forEach(track => pc.addTrack(track, this.localStream));

    // ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.socket?.emit('signal:ice-candidate', { targetSocketId, candidate });
      }
    };

    // Connection state
    pc.onconnectionstatechange = () => {
      this._emit('peer:connection-state', { socketId: targetSocketId, state: pc.connectionState });
      if (pc.connectionState === 'failed') {
        pc.restartIce();
      }
    };

    // Remote stream
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      this._emit('peer:stream', { socketId: targetSocketId, stream, ...participantInfo });
    };

    if (isInitiator) {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      this.socket?.emit('signal:offer', {
        targetSocketId,
        offer: pc.localDescription,
        metadata: {
          name: this.displayName,
          videoEnabled: this.localStream?.getVideoTracks()[0]?.enabled,
          audioEnabled: this.localStream?.getAudioTracks()[0]?.enabled,
        }
      });
    }

    return pc;
  }

  // ─── Internal: Socket Listeners ──────────────────────────────────────────

  _setupListeners() {
    const s = this.socket;

    // New participant → create peer connection (they will send offer)
    s.on('participant:joined', async (participant) => {
      if (!this.peers.has(participant.socketId)) {
        await this._createPeerConnection(participant.socketId, false, participant);
      }
      this._emit('participant:joined', participant);
    });

    s.on('participant:left', (data) => {
      const pc = this.peers.get(data.socketId);
      if (pc) { pc.close(); this.peers.delete(data.socketId); }
      this._emit('participant:left', data);
    });

    // WebRTC signaling
    s.on('signal:offer', async ({ fromSocketId, offer, metadata }) => {
      let pc = this.peers.get(fromSocketId);
      if (!pc) pc = await this._createPeerConnection(fromSocketId, false, metadata);

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      s.emit('signal:answer', { targetSocketId: fromSocketId, answer: pc.localDescription });
    });

    s.on('signal:answer', async ({ fromSocketId, answer }) => {
      const pc = this.peers.get(fromSocketId);
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    s.on('signal:ice-candidate', async ({ fromSocketId, candidate }) => {
      const pc = this.peers.get(fromSocketId);
      if (pc) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { }
      }
    });

    // Media state
    s.on('media:participant-video', (data) => this._emit('participant:video', data));
    s.on('media:participant-audio', (data) => this._emit('participant:audio', data));
    s.on('media:force-mute', (data) => {
      if (data.type !== 'video') this.toggleAudio(false);
      if (data.type !== 'audio') this.toggleVideo(false);
      this._emit('media:force-mute', data);
    });

    // Screen sharing
    s.on('screen:started', (data) => this._emit('screen:started', data));
    s.on('screen:stopped', (data) => this._emit('screen:stopped', data));

    // Chat
    s.on('chat:message', (msg) => this._emit('chat:message', msg));
    s.on('chat:reaction', (data) => this._emit('chat:reaction', data));
    s.on('chat:message-deleted', (data) => this._emit('chat:message-deleted', data));
    s.on('chat:message-pinned', (data) => this._emit('chat:message-pinned', data));
    s.on('chat:user-typing', (data) => this._emit('chat:typing', data));

    // Captions
    s.on('caption:live', (data) => this._emit('caption:live', data));

    // Recording
    s.on('recording:started', (data) => this._emit('recording:started', data));
    s.on('recording:stopped', (data) => this._emit('recording:stopped', data));

    // Documents
    s.on('document:shared', (data) => this._emit('document:shared', data));
    s.on('document:page-changed', (data) => this._emit('document:page-changed', data));
    s.on('document:annotation', (data) => this._emit('document:annotation', data));
    s.on('document:unshared', (data) => this._emit('document:unshared', data));

    // Polls
    s.on('poll:new', (data) => this._emit('poll:new', data));
    s.on('poll:updated', (data) => this._emit('poll:updated', data));
    s.on('poll:ended', (data) => this._emit('poll:ended', data));

    // Reactions
    s.on('reaction:received', (data) => this._emit('reaction:received', data));
    s.on('hand:status', (data) => this._emit('hand:status', data));

    // Room events
    s.on('room:ended', (data) => this._emit('room:ended', data));
    s.on('room:lock-status', (data) => this._emit('room:locked', data));
    s.on('participant:kicked', (data) => this._emit('participant:kicked', data));
    s.on('participant:joined', (data) => this._emit('participant:joined', data));

    // Spotlight
    s.on('spotlight:pinned', (data) => this._emit('spotlight:pinned', data));
    s.on('spotlight:unpinned', (data) => this._emit('spotlight:unpinned', data));

    // Breakout
    s.on('breakout:rooms-created', (data) => this._emit('breakout:created', data));
    s.on('breakout:assigned', (data) => this._emit('breakout:assigned', data));

    // Waiting room
    s.on('waiting-room:admitted', () => this._emit('waiting-room:admitted', {}));
    s.on('waiting-room:denied', (data) => this._emit('waiting-room:denied', data));
    s.on('waiting-room:participant-waiting', (data) => this._emit('waiting-room:waiting', data));

    // Network
    s.on('network:participant-stats', (data) => this._emit('network:peer-stats', data));

    // Stream
    s.on('stream:live', (data) => this._emit('stream:live', data));

    // Disconnect
    s.on('disconnect', () => this._emit('disconnected', {}));
    s.on('reconnect', () => this._emit('reconnected', {}));
  }
}

// ─── REST API Client ──────────────────────────────────────────────────────────

export class MeetLinkAPI {
  constructor({ baseUrl, token }) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async request(method, path, body, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
      ...options.headers,
    };

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(body && { body: JSON.stringify(body) }),
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Request failed');
    return data.data;
  }

  // Auth
  login(email, password) { return this.request('POST', '/api/auth/login', { email, password }); }
  register(name, email, password, role) { return this.request('POST', '/api/auth/register', { name, email, password, role }); }
  refreshToken(refreshToken) { return this.request('POST', '/api/auth/refresh', { refreshToken }); }
  guestToken(name) { return this.request('POST', '/api/auth/guest-token', { name }); }

  // Rooms
  createRoom(data) { return this.request('POST', '/api/rooms', data); }
  createInstantMeeting(name) { return this.request('POST', '/api/rooms/instant', { name }); }
  getRooms(params = {}) { return this.request('GET', `/api/rooms?${new URLSearchParams(params)}`); }
  getRoom(roomId) { return this.request('GET', `/api/rooms/${roomId}`); }
  updateRoom(roomId, data) { return this.request('PATCH', `/api/rooms/${roomId}`, data); }
  deleteRoom(roomId) { return this.request('DELETE', `/api/rooms/${roomId}`); }

  // Recordings
  getRecordings(params = {}) { return this.request('GET', `/api/recordings?${new URLSearchParams(params)}`); }
  getRecording(id) { return this.request('GET', `/api/recordings/${id}`); }
  deleteRecording(id) { return this.request('DELETE', `/api/recordings/${id}`); }
  shareRecording(id, isPublic, accessList) { return this.request('PATCH', `/api/recordings/${id}`, { isPublic, accessList }); }

  // Documents
  getDocuments(params = {}) { return this.request('GET', `/api/documents?${new URLSearchParams(params)}`); }
  deleteDocument(id) { return this.request('DELETE', `/api/documents/${id}`); }

  async uploadDocument(file, roomId) {
    const formData = new FormData();
    formData.append('file', file);
    if (roomId) formData.append('roomId', roomId);

    const res = await fetch(`${this.baseUrl}/api/documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
      body: formData,
    });
    return res.json();
  }

  // Chat
  getChatHistory(roomId, params = {}) { return this.request('GET', `/api/chat/${roomId}/history?${new URLSearchParams(params)}`); }
  exportChat(roomId, format = 'txt') {
    window.open(`${this.baseUrl}/api/chat/${roomId}/export?format=${format}&token=${this.token}`);
  }

  // Transcripts
  getTranscript(roomId, sessionId) { return this.request('GET', `/api/captions/${roomId}/transcript${sessionId ? `?sessionId=${sessionId}` : ''}`); }
  exportTranscript(id, format = 'txt') {
    window.open(`${this.baseUrl}/api/captions/transcript/${id}/export?format=${format}`);
  }

  // Translation
  translate(text, targetLanguage, sourceLanguage) { return this.request('POST', '/api/translation/translate', { text, targetLanguage, sourceLanguage }); }
  getSupportedLanguages() { return this.request('GET', '/api/translation/languages'); }

  // Analytics
  getDashboard() { return this.request('GET', '/api/analytics/dashboard'); }
  getRoomAnalytics(roomId) { return this.request('GET', `/api/analytics/room/${roomId}`); }

  // Users
  getProfile() { return this.request('GET', '/api/users/me'); }
  updateProfile(data) { return this.request('PATCH', '/api/users/me', data); }
  changePassword(currentPassword, newPassword) { return this.request('PATCH', '/api/users/me/password', { currentPassword, newPassword }); }
  searchUsers(q) { return this.request('GET', `/api/users?q=${encodeURIComponent(q)}`); }
}
