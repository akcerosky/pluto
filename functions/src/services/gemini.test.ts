import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeHistory } from './gemini.js';

test('normalizeHistory drops leading assistant turns and preserves alternating sequence', () => {
  const normalized = normalizeHistory([
    { role: 'assistant', content: 'Old summary' },
    { role: 'assistant', content: 'Another model turn' },
    { role: 'user', content: 'Explain ionic bonding' },
    { role: 'assistant', content: 'Sure' },
    { role: 'assistant', content: 'Duplicate model turn' },
    { role: 'user', content: 'Give a summary' },
  ]);

  assert.deepEqual(normalized, [
    { role: 'user', parts: [{ text: 'Explain ionic bonding' }] },
    { role: 'model', parts: [{ text: 'Sure' }] },
    { role: 'user', parts: [{ text: 'Give a summary' }] },
  ]);
});

test('normalizeHistory trims empty entries', () => {
  const normalized = normalizeHistory([
    { role: 'user', content: '   ' },
    { role: 'user', content: 'Actual prompt' },
  ]);

  assert.deepEqual(normalized, [{ role: 'user', parts: [{ text: 'Actual prompt' }] }]);
});
