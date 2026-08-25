const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeEntry } = require('../electron/memory');

test('memória aceita somente mensagens limitadas e sem campos extras', () => {
  const entry = sanitizeEntry({
    role: 'user',
    content: '  olhe minha tela  ',
    apiKey: 'não deve ser persistida',
  });
  assert.deepEqual(entry, { role: 'user', content: 'olhe minha tela' });
});

test('memória rejeita entradas inválidas', () => {
  assert.equal(sanitizeEntry({ role: 'admin', content: 'x' }), null);
  assert.equal(sanitizeEntry({ role: 'user', content: '' }), null);
});
