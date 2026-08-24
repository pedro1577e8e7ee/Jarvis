const { getElevenLabsCredentials, getApiKeyStatus } = require('./settings');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const MAX_TTS_CHARACTERS = 5_000;
const ELEVENLABS_MODEL = 'eleven_multilingual_v2';
// Perfil cinematográfico seguro: voz neural brasileira masculina, sem imitar
// uma gravação específica de filme ou ator.
const EDGE_VOICE = 'pt-BR-AntonioNeural';
const PIPER_MODEL = 'pt_BR-faber-medium.onnx';

function getPiperModelPath() {
  const base = process.resourcesPath && process.resourcesPath.includes('resources')
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : path.join(__dirname, '..');
  return path.join(base, 'models', 'piper', PIPER_MODEL);
}

async function generatePiperSpeech(input) {
  const outputPath = path.join(os.tmpdir(), 'jarvis-piper-' + crypto.randomUUID() + '.wav');
  const inputPath = path.join(os.tmpdir(), 'jarvis-piper-' + crypto.randomUUID() + '.txt');
  const modelPath = getPiperModelPath();
  try {
    require('fs').writeFileSync(inputPath, input, 'utf8');
    await execFileAsync('python', [
      '-m', 'piper',
      '-m', modelPath,
      '-i', inputPath,
      '-f', outputPath,
      '--length-scale', '1.08',
      '--sentence-silence', '0.12',
    ], { input, windowsHide: true, maxBuffer: 1024 * 1024 });
    const audioBuffer = require('fs').readFileSync(outputPath);
    return { audioBuffer, mimeType: 'audio/wav', provider: 'piper', voice: PIPER_MODEL };
  } finally {
    require('fs').rmSync(outputPath, { force: true });
    require('fs').rmSync(inputPath, { force: true });
  }
}

async function generateEdgeSpeech(input) {
  const { EdgeTTS, Constants } = await import('@andresaya/edge-tts');
  const tts = new EdgeTTS();
  await tts.synthesize(input, EDGE_VOICE, {
    rate: '-12%',
    pitch: '-5Hz',
    volume: '100%',
    outputFormat: Constants.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
  });
  return {
    audioBuffer: tts.toBuffer(),
    mimeType: 'audio/mpeg',
    provider: 'edge-tts',
    voice: EDGE_VOICE,
  };
}

async function generateSpeech(text) {
  const input = typeof text === 'string' ? text.trim() : '';
  if (!input) throw new Error('Não há texto para converter em voz.');
  if (input.length > MAX_TTS_CHARACTERS) {
    throw new Error('A resposta excede o limite de 5000 caracteres do ElevenLabs TTS.');
  }

  const status = await getApiKeyStatus();
  if (status.ttsProvider === 'piper') {
    try {
      return await generatePiperSpeech(input);
    } catch (error) {
      console.error('[TTS] Piper indisponivel; usando Edge TTS:', error.message);
    }
  }
  const credentials = status.ttsProvider === 'elevenlabs'
    ? await getElevenLabsCredentials()
    : null;
  if (!credentials) return generateEdgeSpeech(input);
  const { apiKey, voiceId } = credentials;
  const response = await fetch(
    'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId) + '?output_format=mp3_44100_128',
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: input,
        model_id: ELEVENLABS_MODEL,
        language_code: 'pt',
      }),
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error('ElevenLabs TTS retornou HTTP ' + response.status + ': ' + details);
  }

  return {
    audioBuffer: await response.arrayBuffer(),
    mimeType: 'audio/mpeg',
    provider: 'elevenlabs',
  };
}

module.exports = { generateSpeech };
