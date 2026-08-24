const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const { exec } = require('child_process');
const { promisify } = require('util');
const {
  openUrl,
  openWorkspace,
  openExecutable,
  openFolder,
  chromePath,
  edgePath,
  desktopPath,
  downloadsPath,
  documentsPath,
  picturesPath,
  videosPath,
  musicPath,
  onedrivePath,
} = require('./windows-open');
const { abrirQualquerCoisa: openAnythingOnPc } = require('./pc-access');
const { getApiKeyStatus } = require('./settings');

const execAsync = promisify(exec);

const WINDOWS_PROTOCOLS = {
  whatsapp: 'whatsapp://',
  'whatsapp desktop': 'whatsapp://',
  spotify: 'spotify://',
  discord: 'discord://',
  steam: 'steam://open/main',
};

const BUILTIN_APPS = {
  calculadora: 'calc.exe',
  calc: 'calc.exe',
  notepad: 'notepad.exe',
  'bloco de notas': 'notepad.exe',
  explorer: 'explorer.exe',
  'gerenciador de arquivos': 'explorer.exe',
};

function normalizeCommand(value) {
  return String(value || '').trim().toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function quoteWindowsTarget(target) {
  return `"${String(target).replace(/"/g, '""')}"`;
}

async function assertFullPcAccess() {
  const status = await getApiKeyStatus();
  if (!status.allowSystemControl || status.pcAccessMode !== 'full') {
    throw new Error('O Modo Executor esta desligado. Ative o acesso total nas configuracoes.');
  }
}

async function executeWindowsStart(target, label = target) {
  await assertFullPcAccess();
  const safeTarget = String(target || '').trim();
  if (!safeTarget || /[\r\n]/.test(safeTarget)) {
    throw new Error('Destino Windows invalido.');
  }

  const command = `start "" ${quoteWindowsTarget(safeTarget)}`;
  await execAsync(command, { windowsHide: false, timeout: 10000, maxBuffer: 64 * 1024 });
  console.log('[EXECUTOR REAL] Windows exec start:', label);
  return { target: safeTarget, label, method: 'windows-exec', success: true };
}

async function executarComandoWindows(instrucaoOuApp) {
  await assertFullPcAccess();
  const raw = String(instrucaoOuApp || '').trim();
  const normalized = normalizeCommand(raw);
  if (!normalized) throw new Error('Informe o aplicativo, site ou pasta que devo abrir.');

  if (/^https?:\/\//i.test(raw)) return executeWindowsStart(raw, raw);

  const protocol = WINDOWS_PROTOCOLS[normalized];
  if (protocol) return executeWindowsStart(protocol, raw);

  const builtin = BUILTIN_APPS[normalized];
  if (builtin) return executeWindowsStart(builtin, raw);

  const expandedPath = raw.replace(/^~(?=[\\/])/, os.homedir());
  try {
    const stats = await fs.stat(expandedPath);
    if (stats.isDirectory()) {
      await openFolder(expandedPath);
      return { path: expandedPath, label: expandedPath, method: 'shell.openPath', success: true };
    }
    if (stats.isFile()) return executeWindowsStart(expandedPath, expandedPath);
  } catch {
    // Continue with the installed-app catalog and Windows Start resolution.
  }

  // The existing catalog resolves Start-menu shortcuts and installed games;
  // its fallback is still guarded against destructive commands.
  return openAnythingOnPc(raw);
}

function normalizeUrl(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('A automacao recebeu uma URL invalida.');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('A automacao so aceita URLs HTTP ou HTTPS.');
  }
  return parsedUrl.toString();
}

async function navegarWeb(url) {
  await assertFullPcAccess();
  const safeUrl = normalizeUrl(url);
  const result = await openUrl(safeUrl);
  if (!result || result.success === false) {
    throw new Error('O sistema nao confirmou a abertura da URL.');
  }
  return { url: safeUrl, browser: 'default', success: true, label: safeUrl };
}

async function abrirSite(url) {
  return navegarWeb(url);
}

async function abrirSiteReal(url) {
  return navegarWeb(url);
}

async function abrirNavegador(url = 'https://www.google.com/') {
  return navegarWeb(url);
}

async function abrirWorkspaceChrome() {
  await assertFullPcAccess();
  const workspaceUrls = [
    'https://mail.google.com/',
    'https://calendar.google.com/',
    'https://drive.google.com/',
  ];
  const result = await openWorkspace(workspaceUrls);
  if (!result || result.success === false) {
    throw new Error('O sistema nao confirmou a abertura do workspace.');
  }
  return {
    tabs: workspaceUrls,
    success: true,
    label: 'workspace Gmail, Agenda e Drive',
    method: result.method,
  };
}

function resolveFolderPath(caminho) {
  if (typeof caminho !== 'string' || !caminho.trim()) {
    throw new Error('Informe um caminho de pasta valido.');
  }
  const requested = caminho.trim().toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const knownFolders = {
    'area de trabalho': desktopPath(),
    desktop: desktopPath(),
    downloads: downloadsPath(),
    download: downloadsPath(),
    documentos: documentsPath(),
    documents: documentsPath(),
    imagens: picturesPath(),
    pictures: picturesPath(),
    fotos: picturesPath(),
    videos: videosPath(),
    musicas: musicPath(),
    music: musicPath(),
    onedrive: onedrivePath(),
  };
  return knownFolders[requested] || path.resolve(caminho.trim());
}

async function gerenciarPastas(operacao, caminho, nome = '') {
  await assertFullPcAccess();
  const folderPath = resolveFolderPath(caminho);

  if (operacao === 'listar') {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const items = entries.slice(0, 50).map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'pasta' : 'arquivo',
    }));
    console.log('[EXECUTOR REAL] Pasta listada:', folderPath);
    return { path: folderPath, items, success: true, label: folderPath };
  }

  if (operacao === 'criar') {
    const cleanName = typeof nome === 'string' ? nome.trim() : '';
    if (!cleanName || cleanName.includes('/') || cleanName.includes('\\')) {
      throw new Error('Informe um nome simples e valido para a nova pasta.');
    }
    const newFolderPath = path.join(folderPath, cleanName);
    await fs.mkdir(newFolderPath, { recursive: true });
    console.log('[EXECUTOR REAL] Pasta criada:', newFolderPath);
    return { path: newFolderPath, created: true, success: true, label: newFolderPath };
  }

  if (operacao === 'abrir') {
    const stats = await fs.stat(folderPath);
    if (!stats.isDirectory()) throw new Error('O caminho informado nao e uma pasta.');
    await openFolder(folderPath);
    return { path: folderPath, opened: true, success: true, label: folderPath };
  }

  throw new Error('Operacao de pasta nao permitida: ' + operacao);
}

async function abrirPasta(caminho) {
  return gerenciarPastas('abrir', caminho);
}

const WEB_APPS = {
  whatsapp: 'https://web.whatsapp.com/',
  'whatsapp web': 'https://web.whatsapp.com/',
  spotify: 'https://open.spotify.com/',
  discord: 'https://discord.com/app',
  gmail: 'https://mail.google.com/',
  youtube: 'https://www.youtube.com/',
  google: 'https://www.google.com/',
  drive: 'https://drive.google.com/',
  calendario: 'https://calendar.google.com/',
  'google calendar': 'https://calendar.google.com/',
  navegador: 'https://www.google.com/',
};

async function abrirAplicativo(nome) {
  await assertFullPcAccess();
  const normalizedName = typeof nome === 'string' ? nome.trim().toLowerCase() : '';

  if (normalizedName === 'chrome') {
    const chrome = chromePath();
    if (chrome) {
      const opened = await openExecutable(chrome);
      return { name: 'chrome', label: 'Chrome', ...opened, success: true };
    }
    return abrirNavegador('https://www.google.com/');
  }

  if (normalizedName === 'edge') {
    const edge = edgePath();
    if (edge) {
      const opened = await openExecutable(edge);
      return { name: 'edge', label: 'Edge', ...opened, success: true };
    }
    return abrirNavegador('https://www.google.com/');
  }

  const applications = {
    calculadora: { command: 'calc.exe', label: 'Calculadora' },
    calc: { command: 'calc.exe', label: 'Calculadora' },
    'bloco de notas': { command: 'notepad.exe', label: 'Bloco de notas' },
    notepad: { command: 'notepad.exe', label: 'Bloco de notas' },
    explorer: { command: 'explorer.exe', label: 'Explorer' },
    'gerenciador de arquivos': { command: 'explorer.exe', label: 'Explorer' },
    terminal: { command: 'wt.exe', label: 'Terminal' },
    'prompt de comando': { command: 'cmd.exe', label: 'Prompt de comando' },
    cmd: { command: 'cmd.exe', label: 'Prompt de comando' },
    powershell: { command: 'powershell.exe', label: 'PowerShell' },
  };

  const application = applications[normalizedName];
  if (application) {
    const opened = await openExecutable(application.command);
    console.log('[EXECUTOR REAL] Aplicativo aberto: ' + application.label);
    return { name: normalizedName, label: application.label, ...opened, success: true };
  }

  return abrirQualquerCoisa(nome);
}

async function abrirQualquerCoisa(query) {
  await assertFullPcAccess();
  try {
    return await openAnythingOnPc(query);
  } catch (error) {
    const web = WEB_APPS[String(query || '').trim().toLowerCase()];
    if (web) return { label: query, ...await abrirSite(web), success: true };
    throw error;
  }
}

async function closeBrowser() {
  return true;
}

module.exports = {
  abrirSiteReal,
  navegarWeb,
  abrirSite,
  abrirNavegador,
  abrirWorkspaceChrome,
  abrirPasta,
  gerenciarPastas,
  abrirAplicativo,
  abrirQualquerCoisa,
  executarComandoWindows,
  closeBrowser,
};
