/**
 * preload.js — Context Bridge
 * Exposes a safe, minimal API surface from Node/Electron to the React renderer.
 * Never expose `require` or `ipcRenderer` directly — always use contextBridge.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  /**
   * Send a ping to the Main process and await the pong response.
   * @param {string} message - payload to send
   * @returns {Promise<{pong: boolean, message: string, ts: number}>}
   */
  ping: (message) => ipcRenderer.invoke('ping', message),

  /**
   * Sends captured microphone audio to the main process for the full voice flow:
   * transcription, LLM, optional automation, and generated speech.
   * API keys never enter the renderer process.
   */
  transcribeAudio: (audioBuffer, mimeType) =>
    ipcRenderer.invoke('transcribe-audio', { audioBuffer, mimeType }),

  getApiKeyStatus: () => ipcRenderer.invoke('settings:get-api-key-status'),

  saveApiKeys: (keys) => ipcRenderer.invoke('settings:save-api-keys', keys),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  testOpenGoogle: () => ipcRenderer.invoke('executor:test-open-google'),
  sendTextCommand: (text) => ipcRenderer.invoke('jarvis:text-command', { text }),
  analyzeScreen: (question) => ipcRenderer.invoke('jarvis:screen-command', { question }),
  onGlobalShortcut: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('global-shortcut:activate', listener);
    return () => ipcRenderer.removeListener('global-shortcut:activate', listener);
  },
  automationQueue: {
    list: () => ipcRenderer.invoke('automation-queue:list'),
    enqueue: (task) => ipcRenderer.invoke('automation-queue:enqueue', task),
    claim: (id) => ipcRenderer.invoke('automation-queue:claim', { id }),
    finish: (id, state, result) => ipcRenderer.invoke('automation-queue:finish', { id, state, result }),
  },
  browser: {
    openAuthorizedWorkspace: () => ipcRenderer.invoke('browser:open-authorized-workspace'),
  },
});
