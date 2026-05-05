import { parseFlashcardGenerationResponse } from './flashcards.js';

describe('parseFlashcardGenerationResponse', () => {
  test('parses raw JSON', () => {
    const parsed = parseFlashcardGenerationResponse<{ title: string; cards: Array<{ front: string }> }>(
      JSON.stringify({
        title: 'Photosynthesis',
        cards: [{ front: 'What is photosynthesis?' }],
      })
    );

    expect(parsed).toEqual({
      title: 'Photosynthesis',
      cards: [{ front: 'What is photosynthesis?' }],
    });
  });

  test('parses fenced JSON', () => {
    const parsed = parseFlashcardGenerationResponse<{ title: string; cards: Array<{ front: string }> }>(`
\`\`\`json
{"title":"Photosynthesis","cards":[{"front":"What is photosynthesis?"}]}
\`\`\`
`);

    expect(parsed).toEqual({
      title: 'Photosynthesis',
      cards: [{ front: 'What is photosynthesis?' }],
    });
  });

  test('parses JSON surrounded by commentary', () => {
    const parsed = parseFlashcardGenerationResponse<{ title: string; cards: Array<{ front: string }> }>(`
Here is your flashcard set:
{"title":"Photosynthesis","cards":[{"front":"What is photosynthesis?"}]}
Good luck studying!
`);

    expect(parsed).toEqual({
      title: 'Photosynthesis',
      cards: [{ front: 'What is photosynthesis?' }],
    });
  });

  test('returns null for invalid payloads', () => {
    expect(parseFlashcardGenerationResponse('not json at all')).toBeNull();
  });
});
