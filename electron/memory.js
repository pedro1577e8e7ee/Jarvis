const MAX_CONVERSATION_ITEMS = 40;
const MAX_TASK_ITEMS = 100;
const MAX_CONTENT_LENGTH = 2000;

let storePromise = null;

async function getMemoryStore() {
  if (!storePromise) {
    storePromise = import('electron-store').then(({ default: Store }) => new Store({
      name: 'jarvis-memory',
      schema: {
        conversations: { type: 'array', default: [] },
        tasks: { type: 'array', default: [] },
      },
    }));
  }
  return storePromise;
}

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const role = ['system', 'user', 'assistant', 'tool'].includes(entry.role) ? entry.role : null;
  const content = typeof entry.content === 'string' ? entry.content.trim().slice(0, MAX_CONTENT_LENGTH) : '';
  if (!role || !content) return null;
  return { role, content };
}

function trimList(items, limit) {
  return Array.isArray(items) ? items.filter(Boolean).slice(-limit) : [];
}

async function appendConversation(entry) {
  const clean = sanitizeEntry(entry);
  if (!clean) return;
  const store = await getMemoryStore();
  store.set('conversations', trimList([...(store.get('conversations') || []), clean], MAX_CONVERSATION_ITEMS));
}

async function appendTask(task) {
  if (!task || typeof task !== 'object') return;
  const clean = {
    name: typeof task.name === 'string' ? task.name.slice(0, 120) : 'acao',
    label: typeof task.label === 'string' ? task.label.slice(0, 240) : '',
    success: task.success !== false,
    at: new Date().toISOString(),
  };
  const store = await getMemoryStore();
  store.set('tasks', trimList([...(store.get('tasks') || []), clean], MAX_TASK_ITEMS));
}

async function getRecentConversations(limit = 12) {
  const store = await getMemoryStore();
  return trimList(store.get('conversations') || [], Math.min(limit, MAX_CONVERSATION_ITEMS));
}

async function getRecentTasks(limit = 20) {
  const store = await getMemoryStore();
  return trimList(store.get('tasks') || [], Math.min(limit, MAX_TASK_ITEMS));
}

module.exports = {
  sanitizeEntry,
  appendConversation,
  appendTask,
  getRecentConversations,
  getRecentTasks,
};
