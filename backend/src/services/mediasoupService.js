/**
 * Mediasoup SFU Service
 * 
 * Selective Forwarding Unit for large-scale video conferences.
 * Used when participant count exceeds peer-to-peer limits (>6 participants).
 * For smaller calls, direct WebRTC peer connections are used.
 */

const logger = require('../utils/logger');

let mediasoup = null;
const workers = [];
const routers = new Map();    // roomId -> Router
const producers = new Map();  // producerId -> Producer
const consumers = new Map();  // consumerId -> Consumer
const transports = new Map(); // transportId -> Transport

let workerIndex = 0;

const MEDIASOUP_CODECS = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    parameters: { 'sprop-stereo': 1 },
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {},
  },
  {
    kind: 'video',
    mimeType: 'video/VP9',
    clockRate: 90000,
    parameters: { 'profile-id': 2 },
  },
  {
    kind: 'video',
    mimeType: 'video/h264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '4d0032',
      'level-asymmetry-allowed': 1,
    },
  },
];

async function initializeMediasoup() {
  try {
    mediasoup = require('mediasoup');
    
    const numWorkers = parseInt(process.env.MEDIASOUP_WORKER_MAX) || 4;
    
    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: parseInt(process.env.MEDIASOUP_RTC_MIN_PORT) || 40000,
        rtcMaxPort: parseInt(process.env.MEDIASOUP_RTC_MAX_PORT) || 49999,
      });

      worker.on('died', () => {
        logger.error(`Mediasoup worker ${i} died, restarting...`);
        setTimeout(() => createWorker(i), 2000);
      });

      workers.push(worker);
      logger.info(`Mediasoup worker ${i} created (PID: ${worker.pid})`);
    }

    logger.info(`✅ ${workers.length} Mediasoup workers initialized`);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      logger.warn('⚠️ Mediasoup not installed. SFU features disabled. P2P mode only.');
    } else {
      logger.warn('⚠️ Mediasoup initialization failed:', error.message);
    }
  }
}

function getNextWorker() {
  if (workers.length === 0) return null;
  const worker = workers[workerIndex];
  workerIndex = (workerIndex + 1) % workers.length;
  return worker;
}

async function getOrCreateRouter(roomId) {
  if (routers.has(roomId)) return routers.get(roomId);

  const worker = getNextWorker();
  if (!worker) throw new Error('No Mediasoup workers available');

  const router = await worker.createRouter({ mediaCodecs: MEDIASOUP_CODECS });
  routers.set(roomId, router);

  logger.info(`Router created for room ${roomId}`);
  return router;
}

async function createWebRtcTransport(roomId) {
  const router = await getOrCreateRouter(roomId);

  const transport = await router.createWebRtcTransport({
    listenIps: [{
      ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
      announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1',
    }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000,
    minimumAvailableOutgoingBitrate: 600000,
    maxSctpMessageSize: 262144,
  });

  transport.on('dtlsstatechange', (state) => {
    if (state === 'closed') transport.close();
  });

  transports.set(transport.id, { transport, roomId });
  return transport;
}

async function createProducer(transportId, rtpParameters, kind) {
  const transportData = transports.get(transportId);
  if (!transportData) throw new Error('Transport not found');

  const producer = await transportData.transport.produce({ kind, rtpParameters });
  producers.set(producer.id, { producer, roomId: transportData.roomId });

  return producer;
}

async function createConsumer(routerRTPCapabilities, transportId, producerId) {
  const transportData = transports.get(transportId);
  if (!transportData) throw new Error('Transport not found');

  const router = routers.get(transportData.roomId);
  if (!router) throw new Error('Router not found');

  if (!router.canConsume({ producerId, rtpCapabilities: routerRTPCapabilities })) {
    throw new Error('Cannot consume');
  }

  const consumer = await transportData.transport.consume({
    producerId,
    rtpCapabilities: routerRTPCapabilities,
    paused: true, // Start paused, resume when ready
  });

  consumers.set(consumer.id, consumer);
  return consumer;
}

function closeRoom(roomId) {
  const router = routers.get(roomId);
  if (router) {
    router.close();
    routers.delete(roomId);
  }

  // Clean up transports for this room
  for (const [id, data] of transports.entries()) {
    if (data.roomId === roomId) {
      data.transport.close();
      transports.delete(id);
    }
  }
}

async function getRouterRtpCapabilities(roomId) {
  const router = await getOrCreateRouter(roomId);
  return router.rtpCapabilities;
}

module.exports = {
  initializeMediasoup,
  getOrCreateRouter,
  createWebRtcTransport,
  createProducer,
  createConsumer,
  closeRoom,
  getRouterRtpCapabilities,
};
