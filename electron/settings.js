let storePromise = null;
const PROVIDERS = new Set(['groq', 'openai']);

async function getStore() {
  if (!storePromise) {
    storePromise = import('electron-store').then(({ default: Store }) => new Store({
      name: 'jarvis-settings',
      schema: {
        groqApiKey: { type: 'string', default: '' },
        openAiApiKey: { type: 'string', default: '' },
        primaryProvider: { type: 'string', enum: ['groq', 'openai'], default: 'groq' },
        assistantName: { type: 'string', default: 'Jarvis' },
        userName: { type: 'string', default: 'Chefe' },
        allow_system_control: { type: 'boolean', default: true },
        allowBrowserAutomation: { type: 'boolean', default: false },
        allowScreenCapture: { type: 'boolean', default: false },
        allowPassiveListening: { type: 'boolean', default: false },
        allowContinuousConversation: { type: 'boolean', default: false },
        pcAccessMode: { type: 'string', enum: ['full', 'off'], default: 'full' },
        executorGuardVersion: { type: 'number', default: 0 },
        useOpenAiVoice: { type: 'boolean', default: false },
        ttsProvider: { type: 'string', enum: ['piper', 'edge', 'elevenlabs'], default: 'piper' },
        ttsProviderMigrationVersion: { type: 'number', default: 0 },
        elevenLabsApiKey: { type: 'string', default: '' },
        elevenLabsVoiceId: { type: 'string', default: '' },
      },
    }));
  }
  return storePromise;
}

function cleanKey(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeProvider(value) {
  return 'groq';
}

async function migrateExecutorGuard(store) {
  const version = Number(store.get('executorGuardVersion') || 0);
  if (version >= 3) return;
  store.set('allow_system_control', true);
  store.set('pcAccessMode', 'full');
  store.set('executorGuardVersion', 3);
  console.log('[Configuracoes] Permissao Codex: acesso completo ao PC ligado.');
}

async function getApiKeyStatus() {
  const store = await getStore();
  await migrateExecutorGuard(store);
  if (Number(store.get('ttsProviderMigrationVersion') || 0) < 1) {
    store.set('ttsProvider', 'piper');
    store.set('ttsProviderMigrationVersion', 1);
    console.log('[Configuracoes] Piper local definido como voz padrao do Jarvis.');
  }
  const primaryProvider = normalizeProvider(store.get('primaryProvider'));
  const hasGroqKey = Boolean(cleanKey(store.get('groqApiKey')));
  const hasOpenAiKey = Boolean(cleanKey(store.get('openAiApiKey')));
  const hasElevenLabsKey = Boolean(cleanKey(store.get('elevenLabsApiKey')));
  const hasElevenLabsVoiceId = Boolean(cleanKey(store.get('elevenLabsVoiceId')));

  return {
    assistantName: cleanKey(store.get('assistantName')) || 'Jarvis',
    userName: cleanKey(store.get('userName')) || 'Chefe',
    primaryProvider,
    hasGroqKey,
    hasOpenAiKey,
    hasElevenLabsKey,
    hasElevenLabsVoiceId,
    isConfigured: primaryProvider === 'groq' ? hasGroqKey : hasOpenAiKey,
    allowSystemControl: store.get('pcAccessMode') === 'full' || Boolean(store.get('allow_system_control')),
    allowBrowserAutomation: Boolean(store.get('allowBrowserAutomation')),
    allowScreenCapture: Boolean(store.get('allowScreenCapture')),
    allowPassiveListening: Boolean(store.get('allowPassiveListening')),
    allowContinuousConversation: Boolean(store.get('allowContinuousConversation')),
    pcAccessMode: store.get('pcAccessMode') === 'off' ? 'off' : 'full',
    useOpenAiVoice: Boolean(store.get('useOpenAiVoice')),
    ttsProvider: ['piper', 'edge', 'elevenlabs'].includes(store.get('ttsProvider')) ? store.get('ttsProvider') : 'piper',
  };
}

async function saveApiKeys({
  primaryProvider,
  assistantName,
  userName,
  groqApiKey,
  openAiApiKey,
  elevenLabsApiKey,
  elevenLabsVoiceId,
  allowSystemControl,
  allowBrowserAutomation,
  allowScreenCapture,
  allowPassiveListening,
  allowContinuousConversation,
  useOpenAiVoice,
  ttsProvider,
} = {}) {
  const provider = normalizeProvider(primaryProvider);
  const groqKey = cleanKey(groqApiKey);
  const openAiKey = cleanKey(openAiApiKey);
  const elevenKey = cleanKey(elevenLabsApiKey);
  const elevenVoiceId = cleanKey(elevenLabsVoiceId);
  const store = await getStore();

  const hasSelectedKey = provider === 'groq'
    ? Boolean(groqKey || cleanKey(store.get('groqApiKey')))
    : Boolean(openAiKey || cleanKey(store.get('openAiApiKey')));
  if (!hasSelectedKey) {
    throw new Error('Informe a chave do provedor principal selecionado.');
  }

  if (groqKey) store.set('groqApiKey', groqKey);
  if (openAiKey) store.set('openAiApiKey', openAiKey);
  if (elevenKey) store.set('elevenLabsApiKey', elevenKey);
  if (elevenVoiceId) store.set('elevenLabsVoiceId', elevenVoiceId);
  store.set('primaryProvider', provider);
  if (typeof assistantName === 'string' && assistantName.trim()) {
    store.set('assistantName', assistantName.trim().slice(0, 40));
  }
  if (typeof userName === 'string' && userName.trim()) {
    store.set('userName', userName.trim().slice(0, 40));
  }
  if (typeof allowSystemControl === 'boolean') {
    store.set('allow_system_control', allowSystemControl);
    store.set('pcAccessMode', allowSystemControl ? 'full' : 'off');
  }
  if (typeof allowBrowserAutomation === 'boolean') {
    store.set('allowBrowserAutomation', allowBrowserAutomation);
  }
  if (typeof allowScreenCapture === 'boolean') {
    store.set('allowScreenCapture', allowScreenCapture);
  }
  if (typeof allowPassiveListening === 'boolean') {
    store.set('allowPassiveListening', allowPassiveListening);
  }
  if (typeof allowContinuousConversation === 'boolean') {
    store.set('allowContinuousConversation', allowContinuousConversation);
  }
  if (typeof useOpenAiVoice === 'boolean') {
    store.set('useOpenAiVoice', useOpenAiVoice);
  }
  if (ttsProvider === 'piper' || ttsProvider === 'edge' || ttsProvider === 'elevenlabs') {
    store.set('ttsProvider', ttsProvider);
  }
  return getApiKeyStatus();
}

async function enableFullPcAccess() {
  const store = await getStore();
  store.set('allow_system_control', true);
  store.set('pcAccessMode', 'full');
  console.log('[Configuracoes] Acesso completo ao PC ATIVADO.');
  return getApiKeyStatus();
}

async function getPrimaryProvider() {
  const store = await getStore();
  return normalizeProvider(store.get('primaryProvider'));
}

async function getAssistantName() {
  const store = await getStore();
  return cleanKey(store.get('assistantName')) || 'Jarvis';
}

async function getGroqApiKey() {
  const store = await getStore();
  const apiKey = cleanKey(store.get('groqApiKey'));
  if (!apiKey) throw new Error('A chave da Groq não foi configurada.');
  return apiKey;
}

async function getOpenAiApiKey() {
  const store = await getStore();
  const apiKey = cleanKey(store.get('openAiApiKey'));
  if (!apiKey) throw new Error('A chave da OpenAI não foi configurada.');
  return apiKey;
}

async function getElevenLabsCredentials() {
  const store = await getStore();
  const apiKey = cleanKey(store.get('elevenLabsApiKey'));
  const voiceId = cleanKey(store.get('elevenLabsVoiceId'));
  return apiKey && voiceId ? { apiKey, voiceId } : null;
}

module.exports = {
  getApiKeyStatus,
  saveApiKeys,
  enableFullPcAccess,
  getPrimaryProvider,
  getAssistantName,
  getGroqApiKey,
  getOpenAiApiKey,
  getElevenLabsCredentials,
};
