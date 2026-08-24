const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createQueue } = require('../electron/action-queue');

test('a fila impede tarefas duplicadas pelo mesmo idempotencyKey', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-queue-'));
  const queue = createQueue(dataDir);
  const first = queue.enqueue({ idempotencyKey: 'gmail:message-1:reply-1', type: 'draft-reply' });
  const second = queue.enqueue({ idempotencyKey: 'gmail:message-1:reply-1', type: 'draft-reply' });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(queue.list().length, 1);
});

test('tarefas percorrem queued, running e completed sem duplicar', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-queue-'));
  const queue = createQueue(dataDir);
  queue.enqueue({ idempotencyKey: 'instagram:thread-1:reply-1', type: 'draft-reply' });
  const claimed = queue.claim('instagram:thread-1:reply-1');
  assert.equal(claimed.state, 'running');
  assert.equal(queue.claim('instagram:thread-1:reply-1'), null);
  const completed = queue.finish(claimed.id, 'completed', { approved: true });
  assert.equal(completed.state, 'completed');
  assert.equal(queue.claim(claimed.id), null);
});
