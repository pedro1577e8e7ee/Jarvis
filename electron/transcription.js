const https = require('https');
const FormData = require('form-data');

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const PROVIDERS = {
  groq: {
    hostname: 'api.groq.com',
    path: '/openai/v1/audio/transcriptions',
    model: 'whisper-large-v3',
  },
  openai: {
    hostname: 'api.openai.com',
    path: '/v1/audio/transcriptions',
    model: 'whisper-1',
  },
};
const {
  getPrimaryProvider,
  getGroqApiKey,
  getOpenAiApiKey,
} = require('./settings');

function normalizeAudioBuffer(audio) {
  if (audio instanceof ArrayBuffer) return Buffer.from(audio);
  if (ArrayBuffer.isView(audio)) {
    return Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength);
  }
  if (Buffer.isBuffer(audio)) return audio;
  throw new Error('O IPC não recebeu um ArrayBuffer de áudio válido.');
}

function postMultipart({ provider, config, apiKey, audioBuffer, mimeType }) {
  const form = new FormData();
  const contentType = (mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
  form.append('file', audioBuffer, {
    filename: 'audio.webm',
    contentType,
    knownLength: audioBuffer.length,
  });
  form.append('model', config.model);
  form.append('language', 'pt');
  form.append('response_format', 'json');
  if (provider === 'groq') {
    form.append(
      'prompt',
      'Comandos em portugues do Brasil: abre o YouTube, abre o Google, abre o Gmail, abre a calculadora, abre o Chrome, abre a pasta Downloads.',
    );
  }

  const body = form.getBuffer();
  const headers = {
    ...form.getHeaders(),
    Authorization: 'Bearer ' + apiKey,
    'Content-Length': body.length,
  };

  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: config.hostname,
      path: config.path,
      method: 'POST',
      headers,
      timeout: 60_000,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const responseText = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(
            provider + ' retornou HTTP ' + response.statusCode + ': ' + responseText,
          );
          error.statusCode = response.statusCode;
          error.responseText = responseText;
          reject(error);
          return;
        }
        resolve(responseText);
      });
    });
    request.on('timeout', () => request.destroy(new Error('A transcrição excedeu 60 segundos.')));
    request.on('error', reject);
    request.end(body);
  });
}

async function transcribeAudio(audio, mimeType = 'audio/webm') {
  const audioBuffer = normalizeAudioBuffer(audio);
  if (audioBuffer.length === 0) throw new Error('O áudio recebido está vazio.');
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    throw new Error('O áudio excede o limite de 25 MB do provedor.');
  }

  const provider = await getPrimaryProvider();
  const config = PROVIDERS[provider];
  const apiKey = provider === 'groq' ? await getGroqApiKey() : await getOpenAiApiKey();
  console.log('[Transcrição] Enviando arquivo audio.webm:', {
    provider,
    bytes: audioBuffer.length,
    mimeType,
    model: config.model,
  });

  try {
    const responseText = await postMultipart({
      provider,
      config,
      apiKey,
      audioBuffer,
      mimeType,
    });
    const result = JSON.parse(responseText);
    const text = typeof result.text === 'string' ? result.text.trim() : '';
    if (!text) throw new Error('O provedor não retornou texto na transcrição.');
    return text;
  } catch (error) {
    if (provider === 'groq' && config.model === 'whisper-large-v3') {
      console.warn('[Transcrição] whisper-large-v3 falhou, tentando turbo:', error.message);
      const fallback = await postMultipart({
        provider,
        config: { ...config, model: 'whisper-large-v3-turbo' },
        apiKey,
        audioBuffer,
        mimeType,
      });
      const result = JSON.parse(fallback);
      const text = typeof result.text === 'string' ? result.text.trim() : '';
      if (!text) throw new Error('O provedor não retornou texto na transcrição.');
      return text;
    }
    console.error('[Transcrição] Falha detalhada:', {
      provider,
      status: error.statusCode || 'sem status HTTP',
      message: error.message,
      response: error.responseText || 'sem corpo de resposta',
      stack: error.stack,
    });
    throw error;
  }
}

module.exports = { transcribeAudio };
