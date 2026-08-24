const fs = require('fs');
const path = require('path');

const MAX_ITEMS = 500;
function createQueue(dataDir) {
  if (!dataDir) throw new Error('Diretorio da fila nao informado.');
  const filePath = path.join(dataDir, 'jarvis-action-queue.json');

  function readItems() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeItems(items) {
    fs.mkdirSync(dataDir, { recursive: true });
    const temporaryPath = filePath + '.tmp';
    fs.writeFileSync(temporaryPath, JSON.stringify(items.slice(-MAX_ITEMS), null, 2), 'utf8');
    fs.renameSync(temporaryPath, filePath);
  }

  function enqueue({ idempotencyKey, type, payload, requiresConfirmation = true } = {}) {
    const key = String(idempotencyKey || '').trim();
    if (!key) throw new Error('Toda tarefa precisa de um idempotencyKey.');
    if (!type) throw new Error('Toda tarefa precisa de um tipo.');

    const items = readItems();
    const existing = items.find((item) => item.idempotencyKey === key);
    if (existing) return { ...existing, duplicate: true };

    const item = {
      id: key,
      idempotencyKey: key,
      type: String(type),
      payload: payload || {},
      requiresConfirmation: Boolean(requiresConfirmation),
      state: 'queued',
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    items.push(item);
    writeItems(items);
    return { ...item, duplicate: false };
  }

  function claim(id) {
    const items = readItems();
    const item = items.find((entry) => entry.id === id);
    if (!item || item.state !== 'queued') return null;
    item.state = 'running';
    item.attempts += 1;
    item.updatedAt = new Date().toISOString();
    writeItems(items);
    return { ...item };
  }

  function finish(id, state, result = null) {
    if (!['completed', 'failed', 'cancelled'].includes(state)) {
      throw new Error('Estado final invalido.');
    }
    const items = readItems();
    const item = items.find((entry) => entry.id === id);
    if (!item) return null;
    item.state = state;
    item.result = result;
    item.updatedAt = new Date().toISOString();
    writeItems(items);
    return { ...item };
  }

  function list() {
    return readItems();
  }

  return { enqueue, claim, finish, list, filePath };
}

module.exports = { createQueue };
