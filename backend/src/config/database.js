console.log("MONGO_URI:", process.env.MONGO_URI);
const mongoose = require('mongoose');
const logger = require('../utils/logger');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.NODE_ENV === 'production'
    ? process.env.MONGODB_URI_PROD
    : process.env.MONGODB_URI || 'mongodb://localhost:27017/meetlink';

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  isConnected = true;
  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    logger.warn('MongoDB disconnected');
  });
  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB error:', err);
  });
}

module.exports = { connectDB };
