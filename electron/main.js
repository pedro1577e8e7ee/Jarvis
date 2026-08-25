const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');
const { transcribeAudio } = require('./transcription');
const { respondToUser } = require('./llm');
const { generateSpeech } = require('./tts');
const { getApiKeyStatus, saveApiKeys } = require('./settings');
const { abrirSite } = require('./automations');
const { warmupCatalog } = require('./pc-access');
const { createQueue } = require('./action-queue');
const { openAuthorizedWorkspace } = require('./browser-workspace');

// Detect dev mode (Vite dev server running)
// Plain `npm run electron` must open the built renderer. Development mode is
// opt-in so a missing Vite server cannot degrade into the fallback error page.
const isDev = !app.isPackaged && process.env.JARVIS_DEV_SERVER === '1';
const devServerUrl = 'http://localhost:5173';
let mainWindow = null;
let actionQueue = null;

function activateMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.webContents.send('global-shortcut:activate');
}

function registerGlobalShortcut() {
  const accelerator = process.platform === 'darwin'
    ? 'Command+Shift+J'
    : 'CommandOrControl+Shift+J';
  const registered = globalShortcut.register(accelerator, activateMainWindow);
  if (!registered) {
    logError('Nao foi possivel registrar o atalho global ' + accelerator + '.', '');
    return false;
  }
  console.log('[Jarvis] Atalho global registrado:', accelerator);
  return true;
}

function getActionQueue() {
  if (!actionQueue) actionQueue = createQueue(app.getPath('userData'));
  return actionQueue;
}

function logError(context, error) {
  console.error(`[Jarvis] ${context}`, error);
}

async function loadRenderer(win) {
  try {
    if (isDev) {
      await win.loadURL(devServerUrl);
    } else {
      await win.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  } catch (error) {
    logError(`Falha ao carregar o renderer (${isDev ? devServerUrl : 'dist/index.html'}):`, error);

    // Keep the widget open and make the problem visible instead of failing silently.
    const message = encodeURIComponent(
      '<!doctype html><html><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0a0a12;color:#e9e7ff;font-family:Segoe UI,sans-serif;text-align:center">' +
      '<main><strong>Jarvis não conseguiu iniciar.</strong><p>Confira o terminal para os detalhes do erro.</p></main>' +
      '</body></html>',
    );
    await win.loadURL(`data:text/html;charset=utf-8,${message}`).catch((fallbackError) => {
      logError('A tela de erro também não pôde ser exibida:', fallbackError);
    });
  }
}

async function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 250;
  const height = 320;

  const win = new BrowserWindow({
    // ── Floating widget style ──────────────────────────────
    width,
    height,
    frame: false,           // No title bar / window chrome
    transparent: true,      // Allow rounded corners + shadow CSS
    alwaysOnTop: true,      // Always visible on top of other windows
    resizable: false,
    skipTaskbar: false,
    // ── Position: bottom-right corner of primary screen ───
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + workArea.height - height - 24,
    // ── Security ─────────────────────────────────────────
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    logError(`Falha de carregamento [${code}] ${url}:`, description);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    logError('O processo de renderização encerrou:', details);
  });
  win.webContents.on('unresponsive', () => {
    logError('A janela do Jarvis parou de responder.', '');
  });
  win.on('closed', () => {
    mainWindow = null;
  });

  await loadRenderer(win);
  return win;
}

// ── IPC: ping / pong ──────────────────────────────────────────────────────────
ipcMain.handle('ping', async (_event, payload) => {
  console.log('\n🟢 [Main] Ping recebido do React:', payload);
  const response = { pong: true, message: 'Jarvis Main Process respondendo!', ts: Date.now() };
  console.log('🔵 [Main] Enviando pong:', response);
  return response;
});

ipcMain.handle('settings:get-api-key-status', async () => getApiKeyStatus());

ipcMain.handle('automation-queue:list', async () => getActionQueue().list());
ipcMain.handle('automation-queue:enqueue', async (_event, task) => getActionQueue().enqueue(task));
ipcMain.handle('automation-queue:claim', async (_event, { id } = {}) => getActionQueue().claim(id));
ipcMain.handle('automation-queue:finish', async (_event, { id, state, result } = {}) => getActionQueue().finish(id, state, result));
ipcMain.handle('browser:open-authorized-workspace', async () => {
  return openAuthorizedWorkspace(app.getPath('userData'));
});

ipcMain.handle('executor:test-open-google', async () => {
  try {
    const action = await abrirSite('https://www.google.com/');
    console.log('[EXECUTOR REAL] Teste Google concluido:', action);
    return { ok: true, action };
  } catch (error) {
    logError('Falha no teste de abertura do Google:', error);
    throw error;
  }
});

ipcMain.handle('window:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  return true;
});

ipcMain.handle('settings:save-api-keys', async (_event, keys) => {
  try {
    const status = await saveApiKeys(keys);
    console.log('[Configurações] Chaves e preferências salvas:', {
      primaryProvider: status.primaryProvider,
      hasGroqKey: status.hasGroqKey,
      hasOpenAiKey: status.hasOpenAiKey,
      hasElevenLabsKey: status.hasElevenLabsKey,
      hasElevenLabsVoiceId: status.hasElevenLabsVoiceId,
    });
    return status;
  } catch (error) {
    logError('Falha ao salvar as configurações:', error);
    throw error;
  }
});

async function speakResponse(response) {
  if (response.action && mainWindow && !mainWindow.isDestroyed()) {
    console.log('[Jarvis] Acao real confirmada:', response.action);
    mainWindow.setAlwaysOnTop(false);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(true);
    }, 2500);
  }
  let speech = null;
  try {
    speech = await generateSpeech(response.text);
  } catch (error) {
    // The renderer has a native SpeechSynthesis fallback. A TTS network
    // failure must not turn a successful command into a silent response.
    logError('TTS externo indisponivel; usando voz nativa:', error);
  }
  return {
    text: response.text,
    action: response.action,
    audioBuffer: speech?.audioBuffer || null,
    audioMimeType: speech?.mimeType || null,
  };
}

ipcMain.handle('jarvis:text-command', async (_event, { text } = {}) => {
  try {
    const command = typeof text === 'string' ? text.trim() : '';
    console.log('[Jarvis] Comando digitado: ' + command);
    const response = await respondToUser(command);
    console.log('[Jarvis] Resposta: ' + response.text);
    return { transcript: command, ...(await speakResponse(response)) };
  } catch (error) {
    logError('Falha no comando de texto:', error);
    throw new Error(error?.message || 'Falha ao processar o comando digitado.');
  }
});

ipcMain.handle('transcribe-audio', async (_event, { audioBuffer, mimeType } = {}) => {
  try {
    console.log('[Transcrição] Recebido do renderer:', {
      type: Object.prototype.toString.call(audioBuffer),
      byteLength: audioBuffer?.byteLength,
      mimeType,
    });
    const transcript = await transcribeAudio(audioBuffer, mimeType);
    console.log('[Jarvis] Você disse: ' + transcript);

    const response = await respondToUser(transcript);
    console.log('[Jarvis] Resposta: ' + response.text);
    return { transcript, ...(await speakResponse(response)) };
  } catch (error) {
    logError('Falha no fluxo de voz e LLM:', error);
    console.error('[Transcrição] Erro exato:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    const publicError = new Error(error?.message || 'Falha desconhecida ao processar o comando.');
    publicError.name = error?.name || 'JarvisError';
    throw publicError;
  }
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    const access = await getApiKeyStatus();
    console.log('[Jarvis] Permissao do PC:', access.pcAccessMode, 'execucao=', access.allowSystemControl);
    warmupCatalog().catch((error) => logError('Falha ao indexar apps do Windows:', error));
    mainWindow = await createWindow();
    registerGlobalShortcut();
  } catch (error) {
    logError('Falha ao inicializar a janela principal:', error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
        .then((win) => { mainWindow = win; })
        .catch((error) => logError('Falha ao recriar a janela:', error));
    }
  });
}).catch((error) => {
  logError('Falha antes de o Electron ficar pronto:', error);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

process.on('uncaughtException', (error) => {
  logError('Exceção não capturada no processo principal:', error);
});

process.on('unhandledRejection', (reason) => {
  logError('Promise rejeitada sem tratamento no processo principal:', reason);
});
