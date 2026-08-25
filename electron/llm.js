const {
  abrirSite,
  abrirWorkspaceChrome,
  abrirWorkspacePersonalizado,
  gerenciarPastas,
  abrirAplicativo,
  abrirQualquerCoisa,
  executarComandoWindows,
  verificarStatusSistema,
  fecharProcesso,
  agendarLembrete,
} = require('./automations');
const { capturePrimaryScreen } = require('./vision');
const {
  appendConversation,
  appendTask,
  getRecentConversations,
} = require('./memory');
const {
  getApiKeyStatus,
  getPrimaryProvider,
  getAssistantName,
  getGroqApiKey,
  getOpenAiApiKey,
} = require('./settings');
const {
  parseIntent,
  looksLikeOpenRequest,
  claimsExecution,
  confirmationFor,
  repairTranscript,
  isJunkTranscript,
} = require('./intent');

const MAX_HISTORY_MESSAGES = 10;
const sessionHistory = [];
let confirmationCursor = 0;
let conversationCursor = 0;
const PROVIDERS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
  },
};
let groqModelPromise = null;
const GROQ_MODEL_PREFERENCE = [
  'qwen/qwen3.6-27b',
  'qwen/qwen3-32b',
  'moonshotai/kimi-k2-instruct',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
];
const GROQ_VISION_MODEL_PREFERENCE = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.2-90b-vision-preview',
];

const systemTools = [
  {
    type: 'function',
    function: {
      name: 'executarComandoWindows',
      description: 'Ferramenta mestre do Modo Executor. Abre um aplicativo, jogo, site, protocolo ou pasta no Windows usando um destino validado. Nunca envie comandos destrutivos ou texto de shell; envie apenas o nome do destino.',
      parameters: {
        type: 'object',
        properties: {
          instrucaoOuApp: { type: 'string', description: 'Nome do aplicativo/jogo, URL, protocolo Windows ou caminho de pasta.' },
        },
        required: ['instrucaoOuApp'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'olharMinhaTela',
      description: 'Captura a tela principal e descreve o que esta visivel. So use depois de o usuario autorizar Visao de Tela nas configuracoes.',
      parameters: {
        type: 'object',
        properties: {
          pergunta: { type: 'string', description: 'Pergunta opcional sobre o conteudo visivel na tela.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'abrirSite',
      description: 'Abre uma URL real no navegador padrao do Windows. Use sempre que o usuario pedir para abrir um site.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'URL completa incluindo https://.' } },
        required: ['url'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navegarWeb',
      description: 'Alias de abrirSite. Abre a URL no navegador padrao.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'URL completa incluindo https://.' } },
        required: ['url'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'abrirWorkspaceChrome',
      description: 'Abre Gmail, Google Agenda e Google Drive no navegador.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verificarStatusSistema',
      description: 'Consulta CPU, memoria RAM e bateria do computador. Operacao somente de leitura.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fecharProcesso',
      description: 'Fecha um aplicativo pelo nome no Windows. Nao use para processos do sistema.',
      parameters: {
        type: 'object',
        properties: { nomeApp: { type: 'string', description: 'Nome simples do aplicativo, por exemplo Chrome ou Spotify.' } },
        required: ['nomeApp'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agendarLembrete',
      description: 'Agenda um lembrete local persistente que exibira notificacao nativa e voz quando chegar o horario.',
      parameters: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'Texto do lembrete.' },
          atrasoMs: { type: 'number', description: 'Tempo ate o lembrete em milissegundos.' },
        },
        required: ['texto', 'atrasoMs'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'abrirWorkspacePersonalizado',
      description: 'Abre em sequência um workspace local predefinido, como trabalho, desenvolvimento ou estudo. Continua com os itens restantes se um aplicativo opcional não estiver instalado.',
      parameters: {
        type: 'object',
        properties: {
          nomeWorkspace: { type: 'string', enum: ['trabalho', 'desenvolvimento', 'dev', 'estudo'] },
        },
        required: ['nomeWorkspace'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gerenciarPastas',
      description: 'Lista, cria ou abre pastas do Windows. Nunca exclui ou move arquivos.',
      parameters: {
        type: 'object',
        properties: {
          operacao: { type: 'string', enum: ['listar', 'criar', 'abrir'] },
          caminho: { type: 'string', description: 'Caminho absoluto ou atalho: desktop, downloads, documentos.' },
          nome: { type: 'string', description: 'Nome da nova pasta, usado somente ao criar.' },
        },
        required: ['operacao', 'caminho'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'abrirAplicativo',
      description: 'Abre qualquer aplicativo, pasta ou navegador instalado neste Windows. Use o nome falado pelo usuario.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome do app, pasta, navegador ou site. Ex: Discord, Steam, Chrome, Downloads.' },
        },
        required: ['nome'],
        additionalProperties: false,
      },
    },
  },
];

function remember(message) {
  sessionHistory.push(message);
  if (sessionHistory.length > MAX_HISTORY_MESSAGES) {
    sessionHistory.splice(0, sessionHistory.length - MAX_HISTORY_MESSAGES);
  }
  appendConversation(message).catch((error) => console.error('[Memoria] Falha ao salvar conversa:', error.message));
}

let memoryLoaded = false;
async function hydrateMemory() {
  if (memoryLoaded) return;
  const saved = await getRecentConversations(MAX_HISTORY_MESSAGES);
  sessionHistory.push(...saved);
  memoryLoaded = true;
}

function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('A ferramenta retornou argumentos invalidos.');
  }
}

async function getGroqChatModel() {
  if (!groqModelPromise) {
    groqModelPromise = (async () => {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: 'Bearer ' + await getGroqApiKey() },
      });
      if (!response.ok) {
        throw new Error('Nao foi possivel listar os modelos Groq: HTTP ' + response.status);
      }

      const data = await response.json();
      const available = new Set((data.data || []).map((model) => model.id));
      const selected = GROQ_MODEL_PREFERENCE.find((model) => available.has(model));
      if (!selected) {
        throw new Error('A chave Groq nao possui um modelo de chat compativel disponivel.');
      }
      console.log('[LLM] Modelo Groq selecionado automaticamente: ' + selected);
      return selected;
    })().catch((error) => {
      groqModelPromise = null;
      throw error;
    });
  }
  return groqModelPromise;
}

async function getGroqVisionModel() {
  const response = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: 'Bearer ' + await getGroqApiKey() },
  });
  if (!response.ok) throw new Error('Nao foi possivel listar os modelos de visao Groq: HTTP ' + response.status);
  const data = await response.json();
  const available = new Set((data.data || []).map((model) => model.id));
  const selected = GROQ_VISION_MODEL_PREFERENCE.find((model) => available.has(model));
  if (!selected) throw new Error('A chave Groq nao possui um modelo de visao compativel disponivel.');
  return selected;
}

async function createChatCompletion(provider, payload, modelOverride = null) {
  const config = PROVIDERS[provider];
  const apiKey = provider === 'groq' ? await getGroqApiKey() : await getOpenAiApiKey();
  const model = modelOverride || (provider === 'groq' ? await getGroqChatModel() : config.model);
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, ...payload }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(provider + ' Chat retornou HTTP ' + response.status + ': ' + details);
  }
  return response.json();
}

async function analyzeCurrentScreen(question = 'O que esta visivel na tela?') {
  const status = await getApiKeyStatus();
  if (!status.allowScreenCapture) {
    throw new Error('A visao de tela esta desligada. Autorize-a nas configuracoes primeiro.');
  }
  const provider = await getPrimaryProvider();
  const capture = await capturePrimaryScreen();
  const model = provider === 'groq' ? await getGroqVisionModel() : 'gpt-4o-mini';
  const response = await createChatCompletion(provider, {
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: String(question || 'Descreva de forma objetiva o que esta visivel na tela, incluindo alertas, botoes e possiveis erros.') },
        { type: 'image_url', image_url: { url: capture.dataUrl } },
      ],
    }],
    temperature: 0.2,
    max_completion_tokens: 300,
  }, model);
  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error('O modelo de visao nao retornou uma analise.');
  return spokenText(content, 700);
}

async function executeIntent(intent) {
  let action;
  if (intent.type === 'site') {
    action = { success: true, name: 'abrirSite', label: intent.label, ...await abrirSite(intent.url) };
  } else if (intent.type === 'workspace') {
    action = { success: true, name: 'abrirWorkspaceChrome', label: intent.label, ...await abrirWorkspaceChrome() };
  } else if (intent.type === 'workspace-personalized') {
    action = { success: true, name: 'abrirWorkspacePersonalizado', label: intent.label, ...await abrirWorkspacePersonalizado(intent.nomeWorkspace) };
  } else if (intent.type === 'system-status') {
    action = { name: 'verificarStatusSistema', ...await verificarStatusSistema() };
  } else if (intent.type === 'close-process') {
    action = { name: 'fecharProcesso', label: intent.label, ...await fecharProcesso(intent.nomeApp) };
  } else if (intent.type === 'reminder') {
    action = { name: 'agendarLembrete', text: intent.text, label: intent.label, ...await agendarLembrete(intent.text, intent.delayMs) };
  } else if (intent.type === 'folder') {
    action = {
      success: true,
      name: 'gerenciarPastas',
      label: intent.label,
      ...await gerenciarPastas('abrir', intent.caminho),
    };
  } else if (intent.type === 'app') {
    action = { success: true, name: 'abrirAplicativo', label: intent.label, ...await abrirAplicativo(intent.nome) };
  } else if (intent.type === 'anything') {
    action = { success: true, name: 'abrirQualquerCoisa', label: intent.label, ...await abrirQualquerCoisa(intent.query) };
  } else {
    throw new Error('Intencao nao suportada.');
  }
  if (!action || action.success === false) {
    throw new Error('A ferramenta nao confirmou a execucao da acao.');
  }
  return action;
}

async function executeToolCall(toolCall) {
  const args = parseArgs(toolCall.function.arguments);
  const name = toolCall.function.name;
  let action;

  if (name === 'abrirSite' || name === 'navegarWeb') {
    action = { success: true, name: 'abrirSite', label: args.url, ...await abrirSite(args.url) };
  } else if (name === 'abrirWorkspaceChrome') {
    action = { success: true, name: 'abrirWorkspaceChrome', ...await abrirWorkspaceChrome() };
  } else if (name === 'abrirWorkspacePersonalizado') {
    action = {
      success: true,
      name,
      label: args.nomeWorkspace,
      ...await abrirWorkspacePersonalizado(args.nomeWorkspace),
    };
  } else if (name === 'verificarStatusSistema') {
    action = { name, ...await verificarStatusSistema() };
  } else if (name === 'fecharProcesso') {
    action = { name, label: args.nomeApp, ...await fecharProcesso(args.nomeApp) };
  } else if (name === 'agendarLembrete') {
    action = { name, text: args.texto, label: args.texto, ...await agendarLembrete(args.texto, args.atrasoMs) };
  } else if (name === 'olharMinhaTela') {
    const analysis = await analyzeCurrentScreen(args.pergunta || 'Descreva de forma objetiva o que esta visivel na tela.');
    action = {
      success: true,
      name,
      label: 'análise da tela',
      analysis,
    };
  } else if (name === 'gerenciarPastas') {
    action = {
      success: true,
      name: 'gerenciarPastas',
      ...await gerenciarPastas(args.operacao, args.caminho, args.nome),
    };
  } else if (name === 'abrirAplicativo' || name === 'abrirQualquerCoisa') {
    action = { success: true, name: 'abrirQualquerCoisa', label: args.nome || args.query, ...await abrirQualquerCoisa(args.nome || args.query) };
  } else if (name === 'executarComandoWindows') {
    action = {
      success: true,
      name,
      label: args.instrucaoOuApp,
      ...await executarComandoWindows(args.instrucaoOuApp),
    };
  } else {
    throw new Error('Tool nao permitida: ' + name);
  }

  if (!action || action.success === false) {
    throw new Error('A ferramenta nao confirmou a execucao da acao.');
  }

  return {
    action,
    message: {
      role: 'tool',
      tool_call_id: toolCall.id,
      name,
      content: JSON.stringify({ ok: true, action }),
    },
  };
}

function finishWithAction(userText, action, userName) {
  const text = confirmationFor(action, userName);
  remember({ role: 'user', content: userText });
  remember({ role: 'assistant', content: text });
  appendTask(action).catch((error) => console.error('[Memoria] Falha ao salvar tarefa:', error.message));
  return { text, action };
}

function finishWithSpeech(userText, text, action = null, { rememberTurn = true, maxChars = 280 } = {}) {
  const spoken = spokenText(text, maxChars);
  if (rememberTurn) {
    remember({ role: 'user', content: userText });
    remember({ role: 'assistant', content: spoken });
  }
  if (action) appendTask(action).catch((error) => console.error('[Memoria] Falha ao salvar tarefa:', error.message));
  return { text: spoken, action };
}

function nextVariant(variants, cursorName) {
  const index = cursorName === 'conversation' ? conversationCursor++ : confirmationCursor++;
  return variants[index % variants.length];
}

function antiHallucinationPrompt(assistantName, userName, allowSystemControl) {
  const name = assistantName || 'Jarvis';
  const address = userName || 'Chefe';
  if (!allowSystemControl) {
    return (
      'Voce e ' + name + ', assistente em portugues do Brasil. ' +
      'Responda em no maximo duas frases curtas, para ser falado em voz alta. Sem markdown, sem listas, sem titulos. ' +
      'Converse naturalmente sobre qualquer assunto, trabalho ou ideia que o usuario trouxer, sem limitar a conversa a comandos. ' +
      'A permissao de acesso ao PC esta DESLIGADA. ' +
      'E estritamente proibido dizer que abriu sites, pastas ou aplicativos. ' +
      'Se o usuario pedir uma acao, oriente: abra CFG, escolha Acesso completo ao PC e salve.'
    );
  }
  return (
    'Voce e ' + name + ', um Agente de Execucao Total de Windows em portugues do Brasil. ' +
    'Responda em no maximo duas frases curtas, para ser falado em voz alta. Sem markdown, sem listas, sem titulos. ' +
    'Converse naturalmente sobre qualquer assunto, trabalho ou ideia que o usuario trouxer, sem limitar a conversa a comandos. ' +
    'Trate o usuario por ' + address + ' quando isso soar natural, sem repetir o tratamento em toda frase. ' +
    'O usuario autorizou o Modo Executor para abrir aplicativos, jogos, sites e pastas. ' +
    'E estritamente proibido fingir que executou uma acao. ' +
    'Se o usuario pedir para abrir qualquer aplicativo, jogo, site ou pasta que o Windows permita abrir, voce DEVE chamar executarComandoWindows imediatamente. ' +
    'Nunca descreva a acao no texto; chame a funcao. ' +
    'So confirme depois que a ferramenta retornar sucesso. ' +
    'Se a ferramenta falhar, diga: ' + address + ', falhei ao tentar executar essa tarefa.'
  );
}

function spokenText(text, maxChars = 280) {
  return String(text || '')
    .replace(/[#*_`>]/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

async function respondToUser(userText) {
  await hydrateMemory();
  const text = repairTranscript(typeof userText === 'string' ? userText.trim() : '');
  if (!text) throw new Error('Nao ha texto para enviar ao Jarvis.');
  const { allowSystemControl, allowScreenCapture, userName } = await getApiKeyStatus();
  const address = userName || 'Chefe';
  if (isJunkTranscript(text)) {
    return finishWithSpeech(
      text,
      nextVariant([
        'Estou ouvindo, chefe. O que você quer que eu faça?',
        'Pronto para ajudar. Quer abrir um aplicativo, site ou pasta?',
        'Estou aqui. Diga o que você quer executar no computador.',
      ], 'conversation'),
      null,
      { rememberTurn: false },
    );
  }

  const provider = await getPrimaryProvider();
  const assistantName = await getAssistantName();
  const intent = parseIntent(text);

  if (intent?.type === 'screen') {
    if (!allowScreenCapture) {
      return finishWithSpeech(text, address + ', a Visao de Tela esta desligada. Autorize-a nas configuracoes e tente novamente.');
    }
    try {
      const analysis = await analyzeCurrentScreen('Descreva detalhadamente, em portugues do Brasil, o que esta visivel na tela. Destaque textos legiveis, alertas, botoes e possiveis erros.');
      return finishWithSpeech(text, analysis, {
        name: 'olharMinhaTela',
        label: 'análise da tela',
        success: true,
      }, { maxChars: 700 });
    } catch (error) {
      return finishWithSpeech(text, address + ', nao consegui analisar a tela. ' + error.message);
    }
  }

  if (intent && !allowSystemControl) {
    return finishWithSpeech(
      text,
      address + ', a permissao esta em somente conversa. Abra CFG, escolha Acesso completo ao PC e salve. Depois peca de novo.',
    );
  }

  if (intent && allowSystemControl) {
    console.log('[LLM] Intencao local interceptada:', intent);
    try {
      const action = await executeIntent(intent);
      console.log('[LLM] Acao real concluida:', action.name, action.url || action.path || action.label);
      return finishWithAction(text, action, address);
    } catch (error) {
      console.error('[LLM] Execucao real falhou:', error);
      return finishWithSpeech(text, address + ', falhei ao tentar executar essa tarefa. ' + error.message);
    }
  }

  if (looksLikeOpenRequest(text)) {
    return finishWithSpeech(
      text,
      address + ', nao entendi o que abrir. Diga por exemplo: abre o YouTube, abre o Google ou abre a calculadora.',
    );
  }

  const tools = (allowSystemControl || allowScreenCapture) ? systemTools : [];
  const messages = [
    { role: 'system', content: antiHallucinationPrompt(assistantName, userName, allowSystemControl) },
    { role: 'system', content: 'O nome escolhido pelo usuario para voce e: ' + assistantName + '. O usuario prefere ser chamado de: ' + address + '.' },
    ...sessionHistory,
    { role: 'user', content: text },
  ];

  const firstResponse = await createChatCompletion(provider, {
    messages,
    tools,
    tool_choice: (allowSystemControl || allowScreenCapture) ? 'auto' : 'none',
    temperature: 0.2,
    max_completion_tokens: 80,
  });

  const assistantMessage = firstResponse.choices?.[0]?.message;
  if (!assistantMessage) throw new Error('O provedor nao retornou uma resposta do assistente.');

  const toolCalls = assistantMessage.tool_calls || [];
  if (toolCalls.length > 0) {
    if (!allowSystemControl) {
      return finishWithSpeech(
        text,
        address + ', o controle do computador esta desativado. Marque a permissao em Configuracoes para eu executar de verdade.',
      );
    }
    console.log('[LLM] Tool calls interceptadas:', toolCalls.map((call) => call.function.name));
    let executed;
    try {
      executed = [];
      for (const call of toolCalls) {
        executed.push(await executeToolCall(call));
      }
    } catch (error) {
      console.error('[LLM] Execucao real falhou:', error);
      return finishWithSpeech(text, address + ', falhei ao tentar executar essa tarefa. ' + error.message);
    }
    console.log('[LLM] Acoes concluidas com sucesso:', executed.map((item) => item.action.name));
    if (executed[0]?.action?.name === 'olharMinhaTela') {
      return finishWithSpeech(text, executed[0].action.analysis, executed[0].action, { maxChars: 700 });
    }
    return finishWithAction(text, executed[0].action, address);
  }

  const recovered = allowSystemControl && looksLikeOpenRequest(text) ? parseIntent(text) : null;
  if (recovered) {
    try {
      const action = await executeIntent(recovered);
      return finishWithAction(text, action, address);
    } catch (error) {
      return finishWithSpeech(text, address + ', falhei ao tentar executar essa tarefa. ' + error.message);
    }
  }

  const responseText = assistantMessage.content || 'Nao consegui gerar uma resposta.';
  if (claimsExecution(responseText)) {
    console.warn('[LLM] Alucinacao bloqueada. Texto do modelo:', responseText);
    return finishWithSpeech(
      text,
      address + ', eu nao executei essa acao no computador. Diga de forma direta, por exemplo: abra o YouTube.',
    );
  }

  return finishWithSpeech(text, responseText);
}

module.exports = { respondToUser, executeIntent, analyzeCurrentScreen };
