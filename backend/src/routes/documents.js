const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Document } = require('../models');
const logger = require('../utils/logger');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/documents');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const allowedMimeTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
];

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 100) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

function getDocumentType(mimeType) {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'spreadsheet';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
  if (mimeType.startsWith('image/')) return 'image';
  return 'other';
}

// POST /api/documents/upload
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });

    const { roomId, sessionId } = req.body;
    const fileUrl = `/uploads/documents/${req.file.filename}`;

    let pageCount = null;
    if (req.file.mimetype === 'application/pdf') {
      try {
        const pdfParse = require('pdf-parse');
        const data = fs.readFileSync(req.file.path);
        const pdf = await pdfParse(data);
        pageCount = pdf.numpages;
      } catch (e) { /* PDF parsing optional */ }
    }

    const doc = await Document.create({
      name: path.parse(req.file.originalname).name,
      originalName: req.file.originalname,
      url: fileUrl,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.userId,
      room: roomId || null,
      session: sessionId || null,
      type: getDocumentType(req.file.mimetype),
      pageCount,
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: { document: doc },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/documents/upload-multiple
router.post('/upload-multiple', upload.array('files', 10), async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ success: false, message: 'No files provided' });

    const { roomId, sessionId } = req.body;
    const docs = await Promise.all(req.files.map(async (file) => {
      return Document.create({
        name: path.parse(file.originalname).name,
        originalName: file.originalname,
        url: `/uploads/documents/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy: req.userId,
        room: roomId || null,
        session: sessionId || null,
        type: getDocumentType(file.mimetype),
      });
    }));

    res.status(201).json({ success: true, data: { documents: docs } });
  } catch (err) {
    next(err);
  }
});

// GET /api/documents - List user's documents
router.get('/', async (req, res, next) => {
  try {
    const { roomId, type, page = 1, limit = 20 } = req.query;
    const query = { uploadedBy: req.userId };
    if (roomId) query.room = roomId;
    if (type) query.type = type;

    const docs = await Document.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, data: { documents: docs } });
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id).populate('uploadedBy', 'name avatar');
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    res.json({ success: true, data: { document: doc } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/documents/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

    if (doc.uploadedBy.toString() !== req.userId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Delete physical file
    const filePath = path.join(__dirname, '../..', doc.url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await Document.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Document deleted' });
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/room/:roomId - Documents in a room
router.get('/room/:roomId', async (req, res, next) => {
  try {
    const docs = await Document.find({ room: req.params.roomId })
      .populate('uploadedBy', 'name avatar')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: { documents: docs } });
  } catch (err) {
    next(err);
  }
});

// POST /api/documents/:id/annotate
router.post('/:id/annotate', async (req, res, next) => {
  try {
    const { page, x, y, text, color } = req.body;
    const doc = await Document.findByIdAndUpdate(
      req.params.id,
      { $push: { annotations: { page, x, y, text, color, by: req.userId } } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    res.json({ success: true, data: { document: doc } });
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id/download
router.get('/:id/download', async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

    const filePath = path.join(__dirname, '../..', doc.url);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on server' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${doc.originalName}"`);
    res.setHeader('Content-Type', doc.mimeType);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
