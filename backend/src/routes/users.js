const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { User } = require('../models');

const avatarStorage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads/avatars'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${req.userId}-${uuidv4()}${ext}`);
  },
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  },
});

const path2 = require('path');
const fs = require('fs');
const avatarDir = path2.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

// GET /api/users/me
router.get('/me', (req, res) => {
  res.json({ success: true, data: { user: req.user.toPublicJSON() } });
});

// PATCH /api/users/me - Update profile
router.patch('/me', async (req, res, next) => {
  try {
    const { name, bio, organization, preferredLanguage, settings } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (bio !== undefined) updates.bio = bio;
    if (organization !== undefined) updates.organization = organization;
    if (preferredLanguage) updates.preferredLanguage = preferredLanguage;
    if (settings) updates.settings = { ...req.user.settings, ...settings };

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true });
    res.json({ success: true, data: { user: user.toPublicJSON() } });
  } catch (err) { next(err); }
});

// POST /api/users/me/avatar
router.post('/me/avatar', avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image provided' });
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(req.userId, { avatar: avatarUrl }, { new: true });
    res.json({ success: true, data: { avatarUrl, user: user.toPublicJSON() } });
  } catch (err) { next(err); }
});

// PATCH /api/users/me/password
router.patch('/me/password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both passwords required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
    }

    const user = await User.findById(req.userId).select('+password');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Current password is incorrect' });

    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) { next(err); }
});

// GET /api/users/:id - Public profile
router.get('/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('name avatar role organization bio isOnline lastSeen');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: { user } });
  } catch (err) { next(err); }
});

// GET /api/users/search?q=name
router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.status(400).json({ success: false, message: 'Query too short' });

    const users = await User.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ],
      _id: { $ne: req.userId },
    }).select('name avatar role email organization isOnline').limit(20);

    res.json({ success: true, data: { users } });
  } catch (err) { next(err); }
});

module.exports = router;
