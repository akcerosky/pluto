import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeHistory } from './gemini.js';

test('normalizeHistory drops leading assistant turns and preserves alternating sequence', () => {
  const normalized = normalizeHistory([
    { role: 'assistant', parts: [{ type: 'text', text: 'Old summary' }] },
    { role: 'assistant', parts: [{ type: 'text', text: 'Another model turn' }] },
    { role: 'user', parts: [{ type: 'text', text: 'Explain ionic bonding' }] },
    { role: 'assistant', parts: [{ type: 'text', text: 'Sure' }] },
    { role: 'assistant', parts: [{ type: 'text', text: 'Duplicate model turn' }] },
    { role: 'user', parts: [{ type: 'text', text: 'Give a summary' }] },
  ]);

  assert.deepEqual(normalized, [
    { role: 'user', parts: [{ text: 'Explain ionic bonding' }] },
    { role: 'model', parts: [{ text: 'Sure' }] },
    { role: 'user', parts: [{ text: 'Give a summary' }] },
  ]);
});

test('normalizeHistory trims empty entries', () => {
  const normalized = normalizeHistory([
    { role: 'user', parts: [{ type: 'text', text: '   ' }] },
    { role: 'user', parts: [{ type: 'text', text: 'Actual prompt' }] },
  ]);

  assert.deepEqual(normalized, [{ role: 'user', parts: [{ text: 'Actual prompt' }] }]);
});
