const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { BrowserWindow, shell } = require('electron');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function chromePath() {
  return firstExisting([
    path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]);
}

function edgePath() {
  return firstExisting([
    path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ]);
}

function firefoxPath() {
  return firstExisting([
    path.join(process.env.PROGRAMFILES || '', 'Mozilla Firefox', 'firefox.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Mozilla Firefox', 'firefox.exe'),
  ]);
}

function bravePath() {
  return firstExisting([
    path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  ]);
}

function operaPath() {
  return firstExisting([
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Opera', 'opera.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Opera GX', 'opera.exe'),
  ]);
}

function steamPath() {
  return firstExisting([
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Steam', 'steam', 'steam.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Steam', 'steam.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Steam', 'steam.exe'),
    'C:\\Program Files (x86)\\Steam\\steam\\steam.exe',
    'C:\\Program Files (x86)\\Steam\\steam.exe',
  ]);
}

async function openSteamGame(appId, label) {
  const steam = steamPath();
  const id = String(appId);
  if (steam) {
    await spawnVisible(steam, ['-applaunch', id]);
    console.log('[EXECUTOR REAL] Steam -applaunch', id, label || '');
    return { steamId: id, method: 'steam-applaunch', success: true, label: label || id };
  }
  await shell.openExternal('steam://rungameid/' + id);
  console.log('[EXECUTOR REAL] steam://rungameid/' + id);
  return { steamId: id, method: 'steam-protocol', success: true, label: label || id };
}

function browserPaths() {
  return {
    chrome: chromePath(),
    'google chrome': chromePath(),
    edge: edgePath(),
    'microsoft edge': edgePath(),
    firefox: firefoxPath(),
    brave: bravePath(),
    opera: operaPath(),
  };
}

function revealBrowserWindows() {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.setAlwaysOnTop(false); } catch { /* ignore */ }
  }
}

function spawnVisible(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log('[EXECUTOR REAL] spawn visivel:', command, args.join(' '));
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      shell: false,
    });
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(true);
    };
    child.once('error', (error) => done(error));
    child.once('spawn', () => {
      child.unref();
      done(null);
    });
    setTimeout(() => done(new Error('Timeout ao abrir: ' + command)), 8000);
  });
}

async function openUrl(url) {
  revealBrowserWindows();
  const errors = [];
  const chrome = chromePath();
  if (chrome) {
    try {
      await spawnVisible(chrome, ['--new-window', '--start-maximized', url]);
      console.log('[EXECUTOR REAL] Chrome abriu na frente:', url);
      return { url, method: 'chrome-window', success: true };
    } catch (error) {
      errors.push('chrome: ' + error.message);
    }
  }

  const edge = edgePath();
  if (edge) {
    try {
      await spawnVisible(edge, ['--new-window', '--start-maximized', url]);
      console.log('[EXECUTOR REAL] Edge abriu na frente:', url);
      return { url, method: 'edge-window', success: true };
    } catch (error) {
      errors.push('edge: ' + error.message);
    }
  }

  try {
    await shell.openExternal(url);
    console.log('[EXECUTOR REAL] openExternal abriu:', url);
    return { url, method: 'openExternal', success: true };
  } catch (error) {
    errors.push('openExternal: ' + error.message);
  }

  try {
    await spawnVisible('explorer.exe', [url]);
    console.log('[EXECUTOR REAL] explorer abriu:', url);
    return { url, method: 'explorer', success: true };
  } catch (error) {
    errors.push('explorer: ' + error.message);
  }

  throw new Error('Nao consegui abrir no seu PC: ' + errors.join(' | '));
}

async function openWorkspace(urls) {
  const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (list.length === 0) throw new Error('Workspace sem URLs.');
  revealBrowserWindows();

  const chrome = chromePath();
  if (chrome) {
    await spawnVisible(chrome, ['--new-window', '--start-maximized', list[0]]);
    for (let index = 1; index < list.length; index += 1) {
      await delay(550);
      await spawnVisible(chrome, [list[index]]);
    }
    console.log('[EXECUTOR REAL] Workspace Google no Chrome:', list.join(', '));
    return { tabs: list, method: 'chrome-window', success: true };
  }

  const edge = edgePath();
  if (edge) {
    await spawnVisible(edge, ['--new-window', '--start-maximized', list[0]]);
    for (let index = 1; index < list.length; index += 1) {
      await delay(550);
      await spawnVisible(edge, [list[index]]);
    }
    console.log('[EXECUTOR REAL] Workspace Google no Edge:', list.join(', '));
    return { tabs: list, method: 'edge-window', success: true };
  }

  const tabs = [];
  for (const url of list) {
    tabs.push(await openUrl(url));
    await delay(400);
  }
  return { tabs, method: 'sequential', success: true };
}

async function openWithWindowsStart(target) {
  revealBrowserWindows();
  const safe = String(target || '').replace(/["&|<>^]/g, '').trim();
  if (!safe) throw new Error('Nada para abrir.');
  console.log('[EXECUTOR REAL] Windows start ->', safe);
  await new Promise((resolve, reject) => {
    const child = spawn('cmd.exe', ['/c', 'start', '', safe], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      windowsVerbatimArguments: true,
    });
    const timer = setTimeout(() => resolve(true), 500);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('spawn', () => {
      child.unref();
    });
  });
  return { method: 'windows-start', target: safe, success: true };
}

async function openExecutable(command, args = []) {
  const resolved = command.includes('\\') || command.includes('/')
    ? command
    : firstExisting([
      command,
      path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', command),
      path.join(process.env.SYSTEMROOT || 'C:\\Windows', command),
    ]) || command;

  await spawnVisible(resolved, args);
  console.log('[EXECUTOR REAL] App aberto:', resolved);
  return { command: resolved, args, method: 'spawn', success: true };
}

async function openFolder(folderPath) {
  const errorMessage = await shell.openPath(folderPath);
  if (errorMessage) {
    await spawnVisible('explorer.exe', [folderPath]);
  }
  console.log('[EXECUTOR REAL] Pasta aberta:', folderPath);
  return { path: folderPath, opened: true, success: true };
}

function desktopPath() {
  const home = os.homedir();
  return firstExisting([
    path.join(home, 'OneDrive', 'Area de Trabalho'),
    path.join(home, 'OneDrive', 'Área de Trabalho'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(home, 'Desktop'),
    path.join(home, 'Área de Trabalho'),
    path.join(home, 'Area de Trabalho'),
  ]) || path.join(home, 'Desktop');
}

function downloadsPath() {
  const home = os.homedir();
  return firstExisting([
    path.join(home, 'Downloads'),
    path.join(home, 'OneDrive', 'Downloads'),
  ]) || path.join(home, 'Downloads');
}

function documentsPath() {
  const home = os.homedir();
  return firstExisting([
    path.join(home, 'Documents'),
    path.join(home, 'Documentos'),
    path.join(home, 'OneDrive', 'Documents'),
    path.join(home, 'OneDrive', 'Documentos'),
  ]) || path.join(home, 'Documents');
}

function picturesPath() {
  const home = os.homedir();
  return firstExisting([
    path.join(home, 'Pictures'),
    path.join(home, 'Imagens'),
    path.join(home, 'OneDrive', 'Pictures'),
    path.join(home, 'OneDrive', 'Imagens'),
  ]) || path.join(home, 'Pictures');
}

function videosPath() {
  const home = os.homedir();
  return firstExisting([
    path.join(home, 'Videos'),
    path.join(home, 'Vídeos'),
    path.join(home, 'OneDrive', 'Videos'),
  ]) || path.join(home, 'Videos');
}

function musicPath() {
  const home = os.homedir();
  return firstExisting([
    path.join(home, 'Music'),
    path.join(home, 'Músicas'),
    path.join(home, 'OneDrive', 'Music'),
  ]) || path.join(home, 'Music');
}

function onedrivePath() {
  const home = os.homedir();
  return firstExisting([
    path.join(home, 'OneDrive'),
    process.env.OneDrive,
  ].filter(Boolean)) || path.join(home, 'OneDrive');
}

module.exports = {
  delay,
  firstExisting,
  spawnVisible,
  openUrl,
  openWorkspace,
  openExecutable,
  openWithWindowsStart,
  openFolder,
  chromePath,
  edgePath,
  steamPath,
  openSteamGame,
  firefoxPath,
  bravePath,
  operaPath,
  browserPaths,
  desktopPath,
  downloadsPath,
  documentsPath,
  picturesPath,
  videosPath,
  musicPath,
  onedrivePath,
};
