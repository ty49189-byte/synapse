const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;
let pubClient = null;
let subClient = null;

async function connectRedis() {
  const redisUrl = process.env.REDIS_URL;

  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  pubClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  subClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  redisClient.on('connect', () => {
    logger.info('✅ Redis connected');
  });

  redisClient.on('error', (err) => {
    logger.error('❌ Redis error:', err);
  });

  return redisClient;
}

function getRedisClient() {
  return redisClient;
}

function getPubSubClients() {
  return { pub: pubClient, sub: subClient };
}

// Helper methods
const cache = {
  async get(key) {
    if (!redisClient) return null;
    const val = await redisClient.get(key);
    return val ? JSON.parse(val) : null;
  },
  async set(key, value, ttlSeconds = 3600) {
    if (!redisClient) return;
    await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
  },
  async del(key) {
    if (!redisClient) return;
    await redisClient.del(key);
  },
  async hset(hash, field, value) {
    if (!redisClient) return;
    await redisClient.hset(hash, field, JSON.stringify(value));
  },
  async hget(hash, field) {
    if (!redisClient) return null;
    const val = await redisClient.hget(hash, field);
    return val ? JSON.parse(val) : null;
  },
  async hgetall(hash) {
    if (!redisClient) return {};
    const data = await redisClient.hgetall(hash);
    if (!data) return {};
    const result = {};
    for (const [key, val] of Object.entries(data)) {
      result[key] = JSON.parse(val);
    }
    return result;
  },
  async hdel(hash, field) {
    if (!redisClient) return;
    await redisClient.hdel(hash, field);
  },
  async sadd(set, ...members) {
    if (!redisClient) return;
    await redisClient.sadd(set, ...members);
  },
  async smembers(set) {
    if (!redisClient) return [];
    return redisClient.smembers(set);
  },
  async srem(set, member) {
    if (!redisClient) return;
    await redisClient.srem(set, member);
  },
  async expire(key, seconds) {
    if (!redisClient) return;
    await redisClient.expire(key, seconds);
  },
  async incr(key) {
    if (!redisClient) return 0;
    return redisClient.incr(key);
  },
};

module.exports = { connectRedis, getRedisClient, getPubSubClients, cache };
