const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { shell } = require('electron');
const {
  spawnVisible,
  openUrl,
  openFolder,
  openExecutable,
  openWithWindowsStart,
  browserPaths,
  steamPath,
  openSteamGame,
  desktopPath,
  downloadsPath,
  documentsPath,
  picturesPath,
  videosPath,
  musicPath,
  onedrivePath,
} = require('./windows-open');

const ACCENTS = /[\u0300-\u036f]/g;

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(ACCENTS, '')
    .replace(/[^\w\s:/.\\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDangerous(query) {
  return /\b(formatar|formata|apaga tudo|exclui tudo|deleta tudo|rm -rf|shutdown|format c|reg delete)\b/i.test(query);
}

const INSTALLED_GAMES = [
  {
    keys: ['ghost recon breakpoint', 'ghost recon', 'gost recon', 'breakpoint', 'break point', 'ghost', 'o jogo', 'jogo'],
    label: 'Ghost Recon Breakpoint',
    steamId: '2231380',
  },
  {
    keys: ['counter strike 2', 'counter-strike 2', 'counter strike', 'cs2', 'cs 2', 'csgo'],
    label: 'Counter-Strike 2',
    steamId: '730',
  },
  {
    keys: ['steam'],
    label: 'Steam',
    kind: 'steam-app',
  },
  {
    keys: ['ubisoft connect', 'ubisoft', 'uplay'],
    label: 'Ubisoft Connect',
    kind: 'catalog',
    catalogQuery: 'ubisoft connect',
  },
];

function findInstalledGame(query) {
  const key = normalize(query);
  if (!key) return null;
  let best = null;
  let bestLen = 0;
  for (const game of INSTALLED_GAMES) {
    for (const alias of game.keys) {
      if (key === alias || key.includes(alias) || alias.includes(key)) {
        if (alias.length >= bestLen) {
          best = game;
          bestLen = alias.length;
        }
      }
    }
  }
  if (key === 'jogo' || key === 'o jogo') return INSTALLED_GAMES[0];
  return best;
}

function knownFolders() {
  const home = os.homedir();
  return {
    desktop: desktopPath(),
    'area de trabalho': desktopPath(),
    downloads: downloadsPath(),
    download: downloadsPath(),
    documentos: documentsPath(),
    documents: documentsPath(),
    imagens: picturesPath(),
    pictures: picturesPath(),
    fotos: picturesPath(),
    videos: videosPath(),
    filmes: videosPath(),
    musicas: musicPath(),
    music: musicPath(),
    onedrive: onedrivePath(),
    home: home,
    usuario: home,
    appdata: process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
    temp: process.env.TEMP || path.join(home, 'AppData', 'Local', 'Temp'),
  };
}

let catalogCache = null;

async function listShortcuts(root) {
  const out = [];
  if (!root || !fs.existsSync(root)) return out;
  let files = [];
  try {
    files = await fsp.readdir(root, { recursive: true });
  } catch {
    return out;
  }
  for (const file of files) {
    const lower = String(file).toLowerCase();
    if (!lower.endsWith('.lnk') && !lower.endsWith('.url')) continue;
    const full = path.join(root, file);
    const name = path.basename(file).replace(/\.(lnk|url)$/i, '');
    if (!name || /uninstall|desinstalar|help|ajuda|readme/i.test(name)) continue;
    out.push({ name, path: full, key: normalize(name) });
  }
  return out;
}

async function buildCatalog() {
  const roots = [
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    desktopPath(),
  ];
  const apps = [];
  const seen = new Set();
  for (const root of roots) {
    const items = await listShortcuts(root);
    for (const item of items) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      apps.push(item);
    }
  }
  const browsers = browserPaths();
  catalogCache = { apps, browsers, folders: knownFolders(), scannedAt: Date.now() };
  console.log('[PC ACCESS] Catalogo pronto:', apps.length, 'apps do menu Iniciar,', Object.keys(browsers).filter((key) => browsers[key]).length, 'navegadores.');
  return catalogCache;
}

async function getCatalog() {
  if (catalogCache) return catalogCache;
  return buildCatalog();
}

function scoreMatch(query, name) {
  const q = normalize(query);
  const n = normalize(name);
  if (!q || !n) return 0;
  if (n === q) return 100;
  if (n.startsWith(q) || q.startsWith(n)) return 82;
  if (n.includes(' ' + q) || n.includes(q + ' ')) return 75;
  if (n.includes(q) && q.length >= 3) return 60 + Math.min(q.length, 15);
  if (q.includes(n) && n.length >= 4) return 55;
  return 0;
}

function findBestApp(query, apps) {
  let best = null;
  let bestScore = 0;
  for (const app of apps) {
    const score = scoreMatch(query, app.name);
    if (score > bestScore) {
      best = app;
      bestScore = score;
    }
  }
  return bestScore >= 55 ? best : null;
}

async function findFolder(query) {
  const key = normalize(query);
  const folders = knownFolders();
  if (folders[key] && fs.existsSync(folders[key])) return folders[key];

  if (fs.existsSync(query) && fs.statSync(query).isDirectory()) return query;

  const searchRoots = [
    os.homedir(),
    desktopPath(),
    downloadsPath(),
    documentsPath(),
    onedrivePath(),
    picturesPath(),
    videosPath(),
  ];
  let best = null;
  let bestScore = 0;
  for (const root of searchRoots) {
    if (!root || !fs.existsSync(root)) continue;
    let entries = [];
    try {
      entries = await fsp.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const score = scoreMatch(query, entry.name);
      if (score > bestScore) {
        bestScore = score;
        best = path.join(root, entry.name);
      }
    }
  }
  return bestScore >= 70 ? best : null;
}

async function openShortcut(shortcutPath) {
  const errorMessage = await shell.openPath(shortcutPath);
  if (errorMessage) {
    await spawnVisible('explorer.exe', [shortcutPath]);
  }
}

async function abrirQualquerCoisa(query) {
  const raw = String(query || '').trim();
  if (!raw) throw new Error('Diga o que abrir.');
  if (isDangerous(raw)) {
    throw new Error('Esse comando nao e permitido.');
  }

  if (/^https?:\/\//i.test(raw)) {
    const opened = await openUrl(raw);
    return { ...opened, label: raw, name: 'abrirQualquerCoisa', success: true };
  }

  const catalog = await getCatalog();
  const key = normalize(raw);

  const game = findInstalledGame(raw);
  if (game?.steamId) {
    const opened = await openSteamGame(game.steamId, game.label);
    return { ...opened, name: 'abrirQualquerCoisa', success: true };
  }
  if (game?.kind === 'steam-app') {
    const steam = steamPath();
    if (!steam) throw new Error('Steam nao foi encontrado neste PC.');
    const opened = await openExecutable(steam);
    return { ...opened, label: 'Steam', name: 'abrirQualquerCoisa', success: true };
  }
  if (game?.kind === 'catalog') {
    const app = findBestApp(game.catalogQuery || game.label, catalog.apps);
    if (app) {
      await openShortcut(app.path);
      return { path: app.path, label: game.label, method: 'start-menu', name: 'abrirQualquerCoisa', success: true };
    }
  }

  const browser = catalog.browsers[key];
  if (browser) {
    const opened = await openExecutable(browser);
    return { ...opened, label: raw, name: 'abrirQualquerCoisa', success: true };
  }

  const folder = await findFolder(raw);
  if (folder) {
    const opened = await openFolder(folder);
    return { ...opened, label: folder, name: 'abrirQualquerCoisa', success: true };
  }

  const app = findBestApp(raw, catalog.apps);
  if (app) {
    await openShortcut(app.path);
    console.log('[PC ACCESS] App do menu Iniciar:', app.name);
    return { path: app.path, label: app.name, method: 'start-menu', name: 'abrirQualquerCoisa', success: true };
  }

  if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith('\\\\')) {
    await spawnVisible('explorer.exe', [raw]);
    return { label: raw, method: 'explorer', name: 'abrirQualquerCoisa', success: true };
  }

  const started = await openWithWindowsStart(raw);
  console.log('[PC ACCESS] Acesso completo: Windows Start abriu', raw);
  return { ...started, label: raw, name: 'abrirQualquerCoisa', success: true };
}

module.exports = {
  warmupCatalog: buildCatalog,
  getCatalog,
  abrirQualquerCoisa,
  knownFolders,
  normalize,
};
