import { filterDuplicateFlashcardsByConcept, parseFlashcardGenerationResponse } from './flashcards.js';

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

  test('filters duplicate flashcards by normalized concept', () => {
    const filtered = filterDuplicateFlashcardsByConcept(
      [
        { concept: 'Photosynthesis', front: 'Q1', back: 'A1', order: 1 },
        { concept: '  chlorophyll  ', front: 'Q2', back: 'A2', order: 2 },
        { concept: 'PHOTOSYNTHESIS', front: 'Q3', back: 'A3', order: 3 },
      ],
      new Set(['photosynthesis'])
    );

    expect(filtered).toEqual([
      { concept: '  chlorophyll  ', front: 'Q2', back: 'A2', order: 2 },
    ]);
  });
});
