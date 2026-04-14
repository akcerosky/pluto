import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePlanFromAmount } from './http.js';
test('resolvePlanFromAmount maps current commercial pricing to plans', () => {
    assert.equal(resolvePlanFromAmount(299), 'Plus');
    assert.equal(resolvePlanFromAmount(599), 'Pro');
    assert.equal(resolvePlanFromAmount(0), 'Free');
});
