const express = require('express');
const router = express.Router();
const { translateText, translateBatch, detectLanguage, SUPPORTED_LANGUAGES } = require('../services/translationService');
const { ChatMessage } = require('../models');

// GET /api/translation/languages
router.get('/languages', (req, res) => {
  res.json({ success: true, data: { languages: SUPPORTED_LANGUAGES } });
});

// POST /api/translation/translate
router.post('/translate', async (req, res, next) => {
  try {
    const { text, targetLanguage, sourceLanguage = 'auto' } = req.body;

    if (!text) return res.status(400).json({ success: false, message: 'Text is required' });
    if (!targetLanguage) return res.status(400).json({ success: false, message: 'Target language is required' });
    if (!SUPPORTED_LANGUAGES[targetLanguage]) {
      return res.status(400).json({ success: false, message: `Unsupported language: ${targetLanguage}` });
    }

    const result = await translateText(text, targetLanguage, sourceLanguage);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/translation/translate-batch
router.post('/translate-batch', async (req, res, next) => {
  try {
    const { texts, targetLanguage, sourceLanguage = 'auto' } = req.body;

    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ success: false, message: 'texts array required' });
    }
    if (texts.length > 50) {
      return res.status(400).json({ success: false, message: 'Maximum 50 texts per batch' });
    }

    const results = await translateBatch(texts, targetLanguage, sourceLanguage);
    res.json({ success: true, data: { translations: results } });
  } catch (err) {
    next(err);
  }
});

// POST /api/translation/detect
router.post('/detect', async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'Text is required' });

    const result = await detectLanguage(text);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/translation/translate-chat - Translate a specific chat message
router.post('/translate-chat/:messageId', async (req, res, next) => {
  try {
    const { targetLanguage } = req.body;
    const message = await ChatMessage.findById(req.params.messageId);

    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    // Check if already translated to this language
    const existing = message.translations?.find(t => t.language === targetLanguage);
    if (existing) {
      return res.json({ success: true, data: { translatedText: existing.text, cached: true } });
    }

    const result = await translateText(message.content, targetLanguage);

    // Cache translation on the message
    message.translations = message.translations || [];
    message.translations.push({ language: targetLanguage, text: result.translatedText });
    await message.save();

    res.json({ success: true, data: { translatedText: result.translatedText, detectedLanguage: result.detectedLanguage } });
  } catch (err) {
    next(err);
  }
});

// POST /api/translation/translate-caption - Translate a live caption entry
router.post('/translate-caption', async (req, res, next) => {
  try {
    const { text, sourceLanguage = 'auto', targetLanguages } = req.body;

    if (!text) return res.status(400).json({ success: false, message: 'Text is required' });

    const targets = Array.isArray(targetLanguages) ? targetLanguages : [targetLanguages || 'en'];
    const translations = {};

    await Promise.all(
      targets.map(async (lang) => {
        const result = await translateText(text, lang, sourceLanguage);
        translations[lang] = result.translatedText;
      })
    );

    res.json({ success: true, data: { original: text, translations } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
