import { resolvePlanFromAmount } from './http.js';
test('resolvePlanFromAmount maps current commercial pricing to plans', () => {
    expect(resolvePlanFromAmount(299)).toBe('Plus');
    expect(resolvePlanFromAmount(599)).toBe('Pro');
    expect(resolvePlanFromAmount(0)).toBe('Free');
});
