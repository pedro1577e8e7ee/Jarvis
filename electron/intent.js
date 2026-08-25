const ACCENTS = /[\u0300-\u036f]/g;

const SITES = [
  { keys: ['youtube', 'you tube', 'youtub', 'iutubi', 'iu tube', 'iutube', 'u tube'], url: 'https://www.youtube.com/', label: 'YouTube' },
  { keys: ['instagram', 'insta'], url: 'https://www.instagram.com/', label: 'Instagram' },
  { keys: ['gmail', 'e-mail', 'email', 'meu email'], url: 'https://mail.google.com/', label: 'Gmail' },
  { keys: ['google drive', 'drive'], url: 'https://drive.google.com/', label: 'Google Drive' },
  { keys: ['google agenda', 'agenda', 'calendario', 'calendar'], url: 'https://calendar.google.com/', label: 'Google Agenda' },
  { keys: ['google', 'navegador', 'browser', 'internet'], url: 'https://www.google.com/', label: 'Google' },
];

const APPS = [
  { keys: ['calculadora', 'calc'], nome: 'calculadora', label: 'Calculadora' },
  { keys: ['bloco de notas', 'notepad', 'bloco notas'], nome: 'notepad', label: 'Bloco de notas' },
  { keys: ['explorer', 'arquivos', 'gerenciador de arquivos'], nome: 'explorer', label: 'Explorer' },
  { keys: ['chrome', 'google chrome'], nome: 'chrome', label: 'Chrome' },
  { keys: ['edge', 'microsoft edge'], nome: 'edge', label: 'Edge' },
  { keys: ['firefox'], nome: 'firefox', label: 'Firefox' },
  { keys: ['brave'], nome: 'brave', label: 'Brave' },
  { keys: ['opera'], nome: 'opera', label: 'Opera' },
  { keys: ['terminal', 'prompt de comando', 'cmd', 'powershell'], nome: 'terminal', label: 'Terminal' },
];

const GAMES = [
  { keys: ['ghost recon breakpoint', 'ghost recon', 'gost recon', 'breakpoint', 'break point', 'o jogo', 'jogo'], query: 'ghost recon breakpoint', label: 'Ghost Recon Breakpoint' },
  { keys: ['counter strike 2', 'counter strike', 'cs2', 'cs 2', 'csgo'], query: 'counter strike 2', label: 'Counter-Strike 2' },
  { keys: ['steam'], query: 'steam', label: 'Steam' },
  { keys: ['ubisoft connect', 'ubisoft', 'uplay'], query: 'ubisoft connect', label: 'Ubisoft Connect' },
];

const FOLDERS = [
  { keys: ['area de trabalho', 'desktop', 'mesa'], caminho: 'desktop', label: 'Area de Trabalho' },
  { keys: ['downloads', 'download'], caminho: 'downloads', label: 'Downloads' },
  { keys: ['documentos', 'documents', 'meus documentos'], caminho: 'documentos', label: 'Documentos' },
  { keys: ['imagens', 'fotos', 'pictures'], caminho: 'imagens', label: 'Imagens' },
  { keys: ['videos', 'filmes'], caminho: 'videos', label: 'Videos' },
  { keys: ['musicas', 'music'], caminho: 'musicas', label: 'Musicas' },
  { keys: ['onedrive'], caminho: 'onedrive', label: 'OneDrive' },
];

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(ACCENTS, '')
    .replace(/[“”"'`]/g, '')
    .replace(/[^\w\s:/.?-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function repairTranscript(text) {
  return String(text || '')
    .replace(/\biutubi\b/gi, 'YouTube')
    .replace(/\biu[- ]?tube\b/gi, 'YouTube')
    .replace(/\biutube\b/gi, 'YouTube')
    .replace(/\bu tube\b/gi, 'YouTube')
    .replace(/\byou tube\b/gi, 'YouTube')
    .replace(/\bgou?gle\b/gi, 'Google')
    .replace(/\bgugol\b/gi, 'Google')
    .replace(/\bgoo gle\b/gi, 'Google')
    .replace(/\bgimeil\b/gi, 'Gmail')
    .replace(/\bjavis\b/gi, 'Jarvis')
    .replace(/\bgost recon\b/gi, 'Ghost Recon')
    .replace(/\bbreikpoint\b/gi, 'Breakpoint')
    .replace(/\bcs dois\b/gi, 'CS2')
    .trim();
}

function isJunkTranscript(text) {
  const n = normalize(text);
  if (!n || n.length < 3) return true;
  return /^(e ai|eai|oi|ola|fala|hey|hi|hmm+|h+m+|ah+|uh+|um+|\.|\,|\.{2,}|ok|ta|beleza)(\s+(e ai|eai|oi|ola))*$/.test(n);
}

function looksLikeOpenRequest(text) {
  const n = normalize(text);
  return /\b(abre|abra|abrir|inicia|iniciar|mostra|mostrar|executa|executar|abreai|lanca|lancar)\b/.test(n)
    || /\b(pode abrir|consegue abrir|quero que abra|abre pra mim|abre para mim|abre aqui|abre mais|quero ver|quero assistir|coloca o|poe o)\b/.test(n);
}

function findByKeys(list, text) {
  return list.find((item) => item.keys.some((key) => text.includes(key))) || null;
}

function parseUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s]+/i);
  return match ? match[0].replace(/[.,;!?]+$/, '') : null;
}

function parseSearch(text) {
  const n = normalize(text);
  const youtube = n.match(/\b(?:pesquisa|pesquisar|busca|buscar|procura|procurar)\s+(.+?)\s+no youtube\b/);
  if (youtube) {
    const query = youtube[1].trim();
    return {
      type: 'site',
      url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query),
      label: 'busca no YouTube por ' + query,
    };
  }
  const google = n.match(/\b(?:pesquisa|pesquisar|busca|buscar|procura|procurar|google[oa]?)\s+(?:no google\s+)?(.+)$/);
  if (google && !n.includes('abre o google') && !n.includes('abrir o google')) {
    const query = google[1].replace(/\s+no google$/, '').trim();
    if (query && query !== 'google') {
      return {
        type: 'site',
        url: 'https://www.google.com/search?q=' + encodeURIComponent(query),
        label: 'busca no Google por ' + query,
      };
    }
  }
  return null;
}

function parseIntent(userText) {
  const raw = String(userText || '').trim();
  if (!raw) return null;
  const text = normalize(raw);
  const url = parseUrl(raw);
  const wantsOpen = looksLikeOpenRequest(raw);

  if (url && (wantsOpen || /^https?:\/\//i.test(raw.trim()))) {
    return { type: 'site', url, label: url };
  }

  if (/\b(modo\s+(trabalho|desenvolvimento|dev|estudo)|workspace\s+(de|do|da)\s+(desenvolvimento|dev|estudo|trabalho)|workspace de desenvolvimento|abrir workspace de desenvolvimento)\b/.test(text)) {
    const workspaceName = /\b(desenvolvimento|dev|estudo|trabalho)\b/.exec(text)?.[1] || 'trabalho';
    return { type: 'workspace-personalized', nomeWorkspace: workspaceName, label: 'workspace ' + workspaceName };
  }

  if (/\b(workspace|meu workspace|ambiente de trabalho|espaco de trabalho|abre o trabalho|gmail e agenda|agenda e drive|abre tudo do google|abre meu trabalho|google workspace|workspace do google|workspace do navegador|workspace do chrome|gmail agenda drive)\b/.test(text)) {
    return { type: 'workspace', label: 'workspace Gmail, Agenda e Drive' };
  }

  if (wantsOpen) {
    const app = findByKeys(APPS, text);
    if (app) return { type: 'app', nome: app.nome, label: app.label };

    const game = findByKeys(GAMES, text);
    if (game) return { type: 'anything', query: game.query, label: game.label };

    const folder = findByKeys(FOLDERS, text);
    if (folder) return { type: 'folder', caminho: folder.caminho, label: folder.label };

    const site = findByKeys(SITES, text);
    if (site) return { type: 'site', url: site.url, label: site.label };
  }

  const search = parseSearch(raw);
  if (search) return search;

  if (wantsOpen) {
    const match = text.match(/\b(?:abre|abra|abrir|inicia|iniciar|mostra|mostrar|lanca|lancar)\s+(?:o|a|os|as|um|uma|meu|minha|meus|minhas|pasta|aplicativo|app|programa|site)?\s*(.+)$/);
    const target = match?.[1]
      ?.replace(/\b(pra mim|para mim|aqui|agora|por favor|chefe|do computador|no pc)\b/g, '')
      .trim();
    if (target && target.length >= 2) {
      return { type: 'anything', query: target, label: target };
    }
  }

  return null;
}

function claimsExecution(text) {
  return /\b(abri|abriu|aberto|executei|executado|ja abri|já abri|pronto, abri|navegador aberto|youtube aberto|google aberto)\b/i.test(String(text || ''));
}

function confirmationFor(action, userName = 'Chefe') {
  const address = userName || 'Chefe';
  const label = action.label || action.name || 'isso';
  if (action.name === 'gerenciarPastas') {
    return 'Pronto, ' + address + '. A pasta ' + (action.path || label) + ' já está aberta.';
  }
  if (action.name === 'abrirWorkspaceChrome') {
    return 'Feito, ' + address + '. Seu workspace com Gmail, Agenda e Drive já está aberto.';
  }
  if (action.name === 'abrirWorkspacePersonalizado') {
    return action.partial
      ? 'Feito, ' + address + '. O workspace foi aberto, mas alguns itens opcionais não estavam disponíveis.'
      : 'Feito, ' + address + '. O workspace ' + (action.workspace || label) + ' foi aberto.';
  }
  const variants = [
    'Pronto, ' + address + '. ' + label + ' já está aberto.',
    'Feito. Coloquei ' + label + ' na tela.',
    'Tudo certo: ' + label + ' foi iniciado.',
    'Resolvido, ' + address + '. ' + label + ' está disponível agora.',
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

if (require.main === module) {
  const samples = [
    'abre o youtube',
    'Jarvis, abre o Google',
    'pode abrir o gmail pra mim',
    'abre a calculadora',
    'abre a pasta downloads',
    'abre a area de trabalho',
    'pesquisa musica no youtube',
    'abre o workspace',
    'Jarvis, modo trabalho',
    'abrir workspace de desenvolvimento',
    'abre o navegador',
    'abre o discord',
    'abre o steam',
    'abre o ghost recon',
    'abre o jogo',
    'abre o cs2',
    'abre a pasta videos',
    'bom dia jarvis',
  ];
  for (const sample of samples) {
    console.log(sample, '=>', parseIntent(sample));
  }
}

module.exports = {
  normalize,
  parseIntent,
  looksLikeOpenRequest,
  claimsExecution,
  confirmationFor,
  repairTranscript,
  isJunkTranscript,
};
