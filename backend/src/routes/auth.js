const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { generateTokens, authenticateToken } = require('../middleware/auth');
const { authRateLimiter } = require('../middleware/errorHandler');

// POST /api/auth/register
router.post('/register', authRateLimiter, async (req, res, next) => {
  try {
    const { name, email, password, role = 'student', organization } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const user = await User.create({ name, email, password, role, organization });
    const { accessToken, refreshToken } = generateTokens(user);

    await User.findByIdAndUpdate(user._id, { refreshToken });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: user.toPublicJSON(),
        accessToken,
        refreshToken,
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password +refreshToken');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user);
    await User.findByIdAndUpdate(user._id, { refreshToken, isOnline: true, lastSeen: new Date() });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toPublicJSON(),
        accessToken,
        refreshToken,
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token required' });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
    );

    const user = await User.findById(decoded.userId).select('+refreshToken');
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    const tokens = generateTokens(user);
    await User.findByIdAndUpdate(user._id, { refreshToken: tokens.refreshToken });

    res.json({ success: true, data: tokens });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Refresh token expired, please login again' });
    }
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, async (req, res) => {
  await User.findByIdAndUpdate(req.userId, {
    refreshToken: null,
    isOnline: false,
    lastSeen: new Date(),
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  res.json({ success: true, data: { user: req.user.toPublicJSON() } });
});

// POST /api/auth/guest-token - for guest participants
router.post('/guest-token', async (req, res) => {
  const { name, roomId } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Display name required' });

  const guestToken = jwt.sign(
    { userId: `guest_${Date.now()}`, name, role: 'guest', isGuest: true },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({ success: true, data: { accessToken: guestToken, isGuest: true, name } });
});

module.exports = router;
