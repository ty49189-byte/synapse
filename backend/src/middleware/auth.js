const jwt = require('jsonwebtoken');
const { User } = require('../models');
const logger = require('../utils/logger');

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password -refreshToken');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    req.user = user;
    req.userId = user._id.toString();
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(403).json({ success: false, message: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }
    next();
  };
}

function authenticateSocketToken(socket, next) {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];

  if (!token) {
    return next(new Error('Authentication token required'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.userName = decoded.name;
    socket.userRole = decoded.role;
    next();
  } catch (error) {
    next(new Error('Invalid or expired token'));
  }
}

function generateTokens(user) {
  const payload = {
    userId: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

  const refreshToken = jwt.sign(
    { userId: user._id },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

  return { accessToken, refreshToken };
}

module.exports = {
  authenticateToken,
  requireRole,
  authenticateSocketToken,
  generateTokens,
};
