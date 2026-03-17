const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Schema } = mongoose;

// ─── User Model ───────────────────────────────────────────────────────────────
const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8, select: false },
  role: { type: String, enum: ['student', 'teacher', 'admin'], default: 'student' },
  avatar: { type: String, default: null },
  organization: { type: String, default: null },
  bio: { type: String, maxlength: 500, default: '' },
  preferredLanguage: { type: String, default: 'en' },
  settings: {
    notifications: { type: Boolean, default: true },
    autoMute: { type: Boolean, default: false },
    defaultVideoOff: { type: Boolean, default: false },
    captions: { type: Boolean, default: false },
    theme: { type: String, enum: ['dark', 'light', 'system'], default: 'system' },
    noiseSupression: { type: Boolean, default: true },
  },
  refreshToken: { type: String, select: false },
  isEmailVerified: { type: Boolean, default: false },
  emailVerifyToken: { type: String, select: false },
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  lastSeen: { type: Date, default: Date.now },
  isOnline: { type: Boolean, default: false },
  rooms: [{ type: Schema.Types.ObjectId, ref: 'Room' }],
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    avatar: this.avatar,
    organization: this.organization,
    bio: this.bio,
    preferredLanguage: this.preferredLanguage,
    settings: this.settings,
    isOnline: this.isOnline,
    lastSeen: this.lastSeen,
    createdAt: this.createdAt,
  };
};

// ─── Room Model ───────────────────────────────────────────────────────────────
const roomSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, maxlength: 1000, default: '' },
  roomId: { type: String, required: true, unique: true }, // Short code e.g. "abc-def-ghi"
  host: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  coHosts: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  participants: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['host', 'co-host', 'teacher', 'student', 'guest'], default: 'student' },
    joinedAt: { type: Date, default: Date.now },
    permissions: {
      canVideo: { type: Boolean, default: true },
      canAudio: { type: Boolean, default: true },
      canChat: { type: Boolean, default: true },
      canShare: { type: Boolean, default: false },
      canRecord: { type: Boolean, default: false },
    }
  }],
  type: { type: String, enum: ['meeting', 'class', 'webinar', 'stream', 'office-hours'], default: 'meeting' },
  status: { type: String, enum: ['scheduled', 'active', 'ended', 'cancelled'], default: 'scheduled' },
  isPrivate: { type: Boolean, default: true },
  password: { type: String, select: false },
  maxParticipants: { type: Number, default: 100, max: 500 },
  scheduledAt: { type: Date },
  startedAt: { type: Date },
  endedAt: { type: Date },
  duration: { type: Number, default: 0 }, // minutes
  settings: {
    waitingRoom: { type: Boolean, default: false },
    muteOnEntry: { type: Boolean, default: false },
    videoOffOnEntry: { type: Boolean, default: false },
    allowChat: { type: Boolean, default: true },
    allowRecording: { type: Boolean, default: true },
    allowScreenShare: { type: Boolean, default: true },
    allowDocuments: { type: Boolean, default: true },
    enableCaptions: { type: Boolean, default: false },
    captionLanguage: { type: String, default: 'en' },
    recordingConsent: { type: Boolean, default: true },
    breakoutRooms: { type: Boolean, default: false },
  },
  tags: [String],
  // Multi-class / curriculum support
  course: { type: String, default: null },
  subject: { type: String, default: null },
  sessionNumber: { type: Number, default: 1 },
}, { timestamps: true });

// ─── Session Model (Recording of a meeting session) ───────────────────────────
const sessionSchema = new Schema({
  room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  startedAt: { type: Date, required: true },
  endedAt: { type: Date },
  duration: { type: Number, default: 0 }, // seconds
  participantCount: { type: Number, default: 0 },
  participants: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    name: String,
    joinedAt: Date,
    leftAt: Date,
    duration: Number, // seconds
  }],
  hasRecording: { type: Boolean, default: false },
  hasTranscript: { type: Boolean, default: false },
  hasChat: { type: Boolean, default: false },
  peakParticipants: { type: Number, default: 0 },
  networkStats: {
    avgBandwidth: Number,
    peakBandwidth: Number,
    avgLatency: Number,
  },
}, { timestamps: true });

// ─── Chat Message Model ───────────────────────────────────────────────────────
const chatMessageSchema = new Schema({
  room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  session: { type: Schema.Types.ObjectId, ref: 'Session' },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, required: true },
  senderRole: { type: String, default: 'student' },
  content: { type: String, required: true, maxlength: 5000 },
  type: { type: String, enum: ['text', 'file', 'image', 'system', 'reaction', 'poll'], default: 'text' },
  fileUrl: { type: String },
  fileName: { type: String },
  fileSize: { type: Number },
  reactions: [{
    emoji: String,
    users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  }],
  replyTo: { type: Schema.Types.ObjectId, ref: 'ChatMessage' },
  isEdited: { type: Boolean, default: false },
  editedAt: { type: Date },
  isDeleted: { type: Boolean, default: false },
  pinnedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  translations: [{
    language: String,
    text: String,
  }],
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

// ─── Document Model ───────────────────────────────────────────────────────────
const documentSchema = new Schema({
  name: { type: String, required: true },
  originalName: { type: String, required: true },
  url: { type: String, required: true },
  thumbnailUrl: { type: String },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true }, // bytes
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  room: { type: Schema.Types.ObjectId, ref: 'Room' },
  session: { type: Schema.Types.ObjectId, ref: 'Session' },
  type: { type: String, enum: ['pdf', 'presentation', 'spreadsheet', 'document', 'image', 'other'], default: 'other' },
  isShared: { type: Boolean, default: false },
  sharedAt: { type: Date },
  sharedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  pageCount: { type: Number },
  currentPage: { type: Number, default: 1 },
  annotations: [{
    page: Number,
    x: Number,
    y: Number,
    text: String,
    color: String,
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  }],
  accessList: [{ type: Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

// ─── Recording Model ─────────────────────────────────────────────────────────
const recordingSchema = new Schema({
  room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  session: { type: Schema.Types.ObjectId, ref: 'Session' },
  startedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  url: { type: String },
  thumbnailUrl: { type: String },
  size: { type: Number, default: 0 }, // bytes
  duration: { type: Number, default: 0 }, // seconds
  status: { type: String, enum: ['recording', 'processing', 'ready', 'failed', 'deleted'], default: 'recording' },
  type: { type: String, enum: ['full', 'audio-only', 'screen-only'], default: 'full' },
  participants: [String],
  transcript: { type: Schema.Types.ObjectId, ref: 'Transcript' },
  startedAt: { type: Date, required: true },
  endedAt: { type: Date },
  accessList: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  isPublic: { type: Boolean, default: false },
}, { timestamps: true });

// ─── Transcript Model ────────────────────────────────────────────────────────
const transcriptSchema = new Schema({
  room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  session: { type: Schema.Types.ObjectId, ref: 'Session' },
  recording: { type: Schema.Types.ObjectId, ref: 'Recording' },
  language: { type: String, default: 'en' },
  entries: [{
    speaker: { type: Schema.Types.ObjectId, ref: 'User' },
    speakerName: String,
    text: String,
    confidence: Number,
    startTime: Number, // seconds from session start
    endTime: Number,
    translations: [{
      language: String,
      text: String,
    }],
  }],
  fullText: { type: String }, // concatenated for search
  status: { type: String, enum: ['live', 'processing', 'complete'], default: 'live' },
  wordCount: { type: Number, default: 0 },
}, { timestamps: true });

// ─── Breakout Room Model ─────────────────────────────────────────────────────
const breakoutRoomSchema = new Schema({
  parentRoom: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  session: { type: Schema.Types.ObjectId, ref: 'Session' },
  name: { type: String, required: true },
  roomId: { type: String, required: true, unique: true },
  participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  host: { type: Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  duration: { type: Number }, // minutes
  startedAt: { type: Date },
  endedAt: { type: Date },
}, { timestamps: true });

// ─── Live Stream Model ───────────────────────────────────────────────────────
const streamSchema = new Schema({
  room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  host: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String },
  streamKey: { type: String, unique: true },
  rtmpUrl: { type: String },
  playbackUrl: { type: String },
  status: { type: String, enum: ['scheduled', 'live', 'ended'], default: 'scheduled' },
  viewerCount: { type: Number, default: 0 },
  peakViewers: { type: Number, default: 0 },
  scheduledAt: { type: Date },
  startedAt: { type: Date },
  endedAt: { type: Date },
  duration: { type: Number, default: 0 },
  isPublic: { type: Boolean, default: true },
  tags: [String],
  thumbnail: { type: String },
  category: { type: String },
  chatEnabled: { type: Boolean, default: true },
  recordingEnabled: { type: Boolean, default: true },
}, { timestamps: true });

// ─── Poll Model ──────────────────────────────────────────────────────────────
const pollSchema = new Schema({
  room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  session: { type: Schema.Types.ObjectId, ref: 'Session' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  question: { type: String, required: true },
  options: [{
    text: String,
    votes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    count: { type: Number, default: 0 },
  }],
  isAnonymous: { type: Boolean, default: false },
  isMultiChoice: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  totalVotes: { type: Number, default: 0 },
  endedAt: { type: Date },
}, { timestamps: true });

// Export all models
const User = mongoose.model('User', userSchema);
const Room = mongoose.model('Room', roomSchema);
const Session = mongoose.model('Session', sessionSchema);
const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
const Document = mongoose.model('Document', documentSchema);
const Recording = mongoose.model('Recording', recordingSchema);
const Transcript = mongoose.model('Transcript', transcriptSchema);
const BreakoutRoom = mongoose.model('BreakoutRoom', breakoutRoomSchema);
const Stream = mongoose.model('Stream', streamSchema);
const Poll = mongoose.model('Poll', pollSchema);

module.exports = {
  User, Room, Session, ChatMessage, Document,
  Recording, Transcript, BreakoutRoom, Stream, Poll,
};
