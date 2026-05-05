import { normalizePdfSourceDigest } from './questionPapers.js';

describe('normalizePdfSourceDigest', () => {
  test('accepts valid digest payloads', () => {
    expect(
      normalizePdfSourceDigest({
        subject: 'physics',
        primaryTopic: 'electricity',
        coveredConcepts: ['electric current', 'potential difference'],
        keyFacts: ['Current is the rate of flow of charge.'],
        questionBoundaries: ['Do not include magnetism.'],
      })
    ).toEqual({
      subject: 'Physics',
      primaryTopic: 'Electricity',
      coveredConcepts: ['Electric Current', 'Potential Difference'],
      keyFacts: ['Current is the rate of flow of charge.'],
      questionBoundaries: ['Do not include magnetism.'],
    });
  });

  test('returns null instead of throwing on malformed list fields', () => {
    expect(() =>
      normalizePdfSourceDigest({
        subject: 'Physics',
        primaryTopic: 'Electricity',
        coveredConcepts: [{ label: 'current' }],
        keyFacts: 'Current flows',
        questionBoundaries: 'Avoid magnetism',
      })
    ).not.toThrow();

    expect(
      normalizePdfSourceDigest({
        subject: 'Physics',
        primaryTopic: 'Electricity',
        coveredConcepts: [{ label: 'current' }],
        keyFacts: 'Current flows',
        questionBoundaries: 'Avoid magnetism',
      })
    ).toBeNull();
  });
});
