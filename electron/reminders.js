const crypto = require('crypto');
const { Notification } = require('electron');

const MAX_REMINDERS = 100;
let storePromise = null;
let dueHandler = null;
const timers = new Map();

async function getStore() {
  if (!storePromise) {
    storePromise = import('electron-store').then(({ default: Store }) => new Store({
      name: 'jarvis-reminders',
      schema: { reminders: { type: 'array', default: [] } },
    }));
  }
  return storePromise;
}

function cleanReminder(input, { allowPast = false } = {}) {
  const text = typeof input?.text === 'string' ? input.text.trim().slice(0, 500) : '';
  const dueAt = Number(input?.dueAt);
  if (!text || !Number.isFinite(dueAt) || (!allowPast && dueAt <= Date.now())) return null;
  return {
    id: typeof input.id === 'string' ? input.id : crypto.randomUUID(),
    text,
    dueAt,
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

async function persist(reminders) {
  const store = await getStore();
  store.set('reminders', reminders.slice(-MAX_REMINDERS));
}

async function removeReminder(id) {
  const store = await getStore();
  const remaining = (store.get('reminders') || []).filter((item) => item.id !== id);
  await persist(remaining);
}

function scheduleTimer(reminder) {
  const delay = Math.max(0, Math.min(reminder.dueAt - Date.now(), 2_147_000_000));
  const timer = setTimeout(async () => {
    timers.delete(reminder.id);
    if (Date.now() < reminder.dueAt) return scheduleTimer(reminder);
    await removeReminder(reminder.id);
    if (Notification.isSupported()) new Notification({ title: 'Jarvis', body: reminder.text }).show();
    await dueHandler?.(reminder);
  }, delay);
  timers.set(reminder.id, timer);
}

async function scheduleReminder({ text, delayMs } = {}) {
  const cleanText = typeof text === 'string' ? text.trim().slice(0, 500) : '';
  const delay = Number(delayMs);
  if (!cleanText || !Number.isFinite(delay) || delay < 1000 || delay > 365 * 24 * 60 * 60 * 1000) {
    throw new Error('Lembrete invalido. Use um prazo entre 1 segundo e 365 dias.');
  }
  const reminder = cleanReminder({ text: cleanText, dueAt: Date.now() + delay });
  const store = await getStore();
  const reminders = [...(store.get('reminders') || []), reminder].slice(-MAX_REMINDERS);
  await persist(reminders);
  scheduleTimer(reminder);
  return { ...reminder, delayMs: delay, success: true, label: cleanText, method: 'persistent-timer' };
}

async function restoreReminders() {
  const store = await getStore();
  const stored = (store.get('reminders') || []).map((item) => cleanReminder(item, { allowPast: true })).filter(Boolean);
  const now = Date.now();
  const due = stored.filter((item) => item.dueAt <= now);
  const future = stored.filter((item) => item.dueAt > now);
  store.set('reminders', future);
  future.forEach(scheduleTimer);
  for (const reminder of due) {
    if (Notification.isSupported()) new Notification({ title: 'Jarvis', body: reminder.text }).show();
    await dueHandler?.(reminder);
  }
  return future;
}

async function initReminders(onDue) {
  dueHandler = typeof onDue === 'function' ? onDue : null;
  return restoreReminders();
}

module.exports = { initReminders, scheduleReminder, restoreReminders };
