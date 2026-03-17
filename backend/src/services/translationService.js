/**
 * Translation & Speech-to-Text Service
 * Supports: Google Translate, DeepL, LibreTranslate
 * STT: Google Speech, Deepgram, AssemblyAI
 */

const axios = require('axios');
const logger = require('../utils/logger');

// ─── Translation ─────────────────────────────────────────────────────────────

const SUPPORTED_LANGUAGES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  it: 'Italian', pt: 'Portuguese', ru: 'Russian', zh: 'Chinese (Simplified)',
  ja: 'Japanese', ko: 'Korean', ar: 'Arabic', hi: 'Hindi',
  nl: 'Dutch', pl: 'Polish', tr: 'Turkish', sv: 'Swedish',
  da: 'Danish', fi: 'Finnish', no: 'Norwegian', cs: 'Czech',
  uk: 'Ukrainian', th: 'Thai', vi: 'Vietnamese', id: 'Indonesian',
  ms: 'Malay', bn: 'Bengali', ur: 'Urdu', fa: 'Persian',
};

async function translateText(text, targetLanguage, sourceLanguage = 'auto') {
  const provider = process.env.TRANSLATION_PROVIDER || 'google';

  try {
    switch (provider) {
      case 'google':
        return translateWithGoogle(text, targetLanguage, sourceLanguage);
      case 'deepl':
        return translateWithDeepL(text, targetLanguage, sourceLanguage);
      case 'libretranslate':
        return translateWithLibreTranslate(text, targetLanguage, sourceLanguage);
      default:
        return translateWithGoogle(text, targetLanguage, sourceLanguage);
    }
  } catch (error) {
    logger.error('Translation failed:', error.message);
    return { translatedText: text, detectedLanguage: sourceLanguage, error: error.message };
  }
}

async function translateWithGoogle(text, target, source) {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) throw new Error('Google Translate API key not configured');

  const response = await axios.post(
    `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
    { q: text, target, ...(source !== 'auto' && { source }), format: 'text' }
  );

  const data = response.data.data.translations[0];
  return {
    translatedText: data.translatedText,
    detectedLanguage: data.detectedSourceLanguage || source,
    provider: 'google',
  };
}

async function translateWithDeepL(text, target, source) {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) throw new Error('DeepL API key not configured');

  const response = await axios.post(
    'https://api-free.deepl.com/v2/translate',
    null,
    {
      params: {
        auth_key: apiKey,
        text,
        target_lang: target.toUpperCase(),
        ...(source !== 'auto' && { source_lang: source.toUpperCase() }),
      }
    }
  );

  const translation = response.data.translations[0];
  return {
    translatedText: translation.text,
    detectedLanguage: translation.detected_source_language?.toLowerCase() || source,
    provider: 'deepl',
  };
}

async function translateWithLibreTranslate(text, target, source) {
  const baseUrl = process.env.LIBRETRANSLATE_URL || 'https://libretranslate.com';

  const response = await axios.post(`${baseUrl}/translate`, {
    q: text,
    source: source === 'auto' ? 'auto' : source,
    target,
    format: 'text',
    api_key: process.env.LIBRETRANSLATE_API_KEY || '',
  });

  return {
    translatedText: response.data.translatedText,
    detectedLanguage: response.data.detectedLanguage?.language || source,
    provider: 'libretranslate',
  };
}

async function translateBatch(texts, targetLanguage, sourceLanguage = 'auto') {
  const results = await Promise.allSettled(
    texts.map(text => translateText(text, targetLanguage, sourceLanguage))
  );

  return results.map((result, idx) => ({
    original: texts[idx],
    ...(result.status === 'fulfilled' ? result.value : { translatedText: texts[idx], error: result.reason.message })
  }));
}

async function detectLanguage(text) {
  try {
    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (!apiKey) return { language: 'en', confidence: 0 };

    const response = await axios.post(
      `https://translation.googleapis.com/language/translate/v2/detect?key=${apiKey}`,
      { q: text }
    );

    const detection = response.data.data.detections[0][0];
    return {
      language: detection.language,
      confidence: detection.confidence,
    };
  } catch (err) {
    return { language: 'en', confidence: 0 };
  }
}

// ─── Speech to Text (REST-based for non-streaming) ───────────────────────────

async function transcribeAudio(audioBuffer, mimeType, language = 'en') {
  const provider = process.env.STT_PROVIDER || 'google';

  try {
    switch (provider) {
      case 'google':
        return transcribeWithGoogle(audioBuffer, mimeType, language);
      case 'deepgram':
        return transcribeWithDeepgram(audioBuffer, mimeType, language);
      case 'assemblyai':
        return transcribeWithAssemblyAI(audioBuffer, language);
      default:
        return transcribeWithGoogle(audioBuffer, mimeType, language);
    }
  } catch (err) {
    logger.error('Transcription failed:', err.message);
    return { transcript: '', words: [], confidence: 0 };
  }
}

async function transcribeWithGoogle(audioBuffer, mimeType, language) {
  const apiKey = process.env.GOOGLE_SPEECH_API_KEY;
  if (!apiKey) throw new Error('Google Speech API key not configured');

  const encodingMap = {
    'audio/webm': 'WEBM_OPUS',
    'audio/ogg': 'OGG_OPUS',
    'audio/wav': 'LINEAR16',
    'audio/flac': 'FLAC',
    'audio/mp4': 'MP3',
  };

  const response = await axios.post(
    `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
    {
      config: {
        encoding: encodingMap[mimeType] || 'WEBM_OPUS',
        sampleRateHertz: 48000,
        languageCode: language,
        enableWordTimeOffsets: true,
        enableAutomaticPunctuation: true,
        model: 'latest_long',
        useEnhanced: true,
      },
      audio: { content: audioBuffer.toString('base64') }
    }
  );

  const results = response.data.results || [];
  const transcript = results.map(r => r.alternatives[0]?.transcript || '').join(' ');
  const confidence = results[0]?.alternatives[0]?.confidence || 0;

  return { transcript, confidence, provider: 'google' };
}

async function transcribeWithDeepgram(audioBuffer, mimeType, language) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('Deepgram API key not configured');

  const response = await axios.post(
    'https://api.deepgram.com/v1/listen',
    audioBuffer,
    {
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': mimeType,
      },
      params: {
        language,
        punctuate: true,
        diarize: true,
        smart_format: true,
        words: true,
      }
    }
  );

  const result = response.data.results?.channels[0]?.alternatives[0];
  return {
    transcript: result?.transcript || '',
    words: result?.words || [],
    confidence: result?.confidence || 0,
    provider: 'deepgram',
  };
}

async function transcribeWithAssemblyAI(audioBuffer, language) {
  const apiKey = process.env.ASSEMBLY_AI_KEY;
  if (!apiKey) throw new Error('AssemblyAI API key not configured');

  // Upload audio
  const uploadResponse = await axios.post('https://api.assemblyai.com/v2/upload', audioBuffer, {
    headers: { 'authorization': apiKey, 'content-type': 'application/octet-stream' },
  });

  // Submit for transcription
  const transcriptResponse = await axios.post('https://api.assemblyai.com/v2/transcript', {
    audio_url: uploadResponse.data.upload_url,
    language_code: language,
    punctuate: true,
    format_text: true,
    speaker_labels: true,
  }, { headers: { 'authorization': apiKey } });

  // Poll for completion
  const transcriptId = transcriptResponse.data.id;
  let result;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const poll = await axios.get(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { 'authorization': apiKey },
    });
    if (poll.data.status === 'completed') { result = poll.data; break; }
    if (poll.data.status === 'error') throw new Error(poll.data.error);
  }

  return {
    transcript: result?.text || '',
    words: result?.words || [],
    confidence: result?.confidence || 0,
    provider: 'assemblyai',
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  translateText,
  translateBatch,
  detectLanguage,
  transcribeAudio,
  SUPPORTED_LANGUAGES,
};
