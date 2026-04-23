import { selectPrimaryProvider } from './router.js';

test('routes text-only requests to nova micro', () => {
  expect(selectPrimaryProvider([])).toBe('nova-micro');
});

test('routes attachment requests to gemini', () => {
  expect(
    selectPrimaryProvider([
      {
        name: 'worksheet.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        base64Data: 'QQ==',
      },
    ])
  ).toBe('gemini');
});
