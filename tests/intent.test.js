const test = require('node:test');
const assert = require('node:assert/strict');
const { parseIntent, confirmationFor } = require('../electron/intent');

test('reconhece modo trabalho como workspace personalizado', () => {
  assert.deepEqual(parseIntent('Jarvis, modo trabalho'), {
    type: 'workspace-personalized',
    nomeWorkspace: 'trabalho',
    label: 'workspace trabalho',
  });
});

test('reconhece workspace de desenvolvimento sem confundir com workspace Google', () => {
  const intent = parseIntent('abrir workspace de desenvolvimento');
  assert.equal(intent.type, 'workspace-personalized');
  assert.equal(intent.nomeWorkspace, 'desenvolvimento');
});

test('mantém workspace Google existente', () => {
  assert.deepEqual(parseIntent('abre o workspace'), {
    type: 'workspace',
    label: 'workspace Gmail, Agenda e Drive',
  });
});

test('confirma workspace parcial sem afirmar sucesso total', () => {
  const message = confirmationFor({
    name: 'abrirWorkspacePersonalizado',
    workspace: 'workspace de desenvolvimento',
    partial: true,
    label: 'workspace de desenvolvimento',
  }, 'Chefe');
  assert.match(message, /alguns itens opcionais/);
});

test('reconhece pedido de visão da tela', () => {
  assert.deepEqual(parseIntent('Jarvis, olhe minha tela'), {
    type: 'screen',
    label: 'análise da tela',
  });
});

test('extrai lembrete com duração em minutos', () => {
  assert.deepEqual(parseIntent('Jarvis, me lembre em 5 minutos de revisar o contrato'), {
    type: 'reminder',
    delayMs: 300000,
    text: 'revisar o contrato',
    label: 'lembrete: revisar o contrato',
  });
});

test('extrai status do computador e fechamento de aplicativo', () => {
  assert.deepEqual(parseIntent('qual o status do meu computador'), {
    type: 'system-status',
    label: 'status do sistema',
  });
  assert.deepEqual(parseIntent('fechar o Spotify'), {
    type: 'close-process',
    nomeApp: 'spotify',
    label: 'fechar spotify',
  });
});
