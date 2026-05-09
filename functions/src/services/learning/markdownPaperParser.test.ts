import { parseMarkdownPaper } from './markdownPaperParser.js';

describe('parseMarkdownPaper', () => {
  test('parses a complete markdown paper', () => {
    const parsed = parseMarkdownPaper(`
# Class 10 Physics Question Paper
**Board:** CBSE | **Level:** Class 10 | **Subject:** Physics
**Time:** 3 hours | **Total Marks:** 10

## General Instructions
1. Answer all questions.
2. Draw neat diagrams where necessary.

## Section A — MCQ (2 × 1 = 2 Marks)
Choose the correct option.

**Q1.** Unit of force is? **[1 marks]**
(A) Newton
(B) Joule
(C) Pascal
(D) Watt

**Q2.** Speed is a scalar quantity. **[1 marks]**
(A) True
(B) False
(C) Both
(D) Neither

## Section B — Short Answer (2 × 4 = 8 Marks)
Answer briefly.

**Q3.** Define force. **[4 marks]**
**Q4.** State Newton's second law. **[4 marks]**
    `);

    expect(parsed.title).toBe('Class 10 Physics Question Paper');
    expect(parsed.board).toBe('CBSE');
    expect(parsed.level).toBe('Class 10');
    expect(parsed.subject).toBe('Physics');
    expect(parsed.generalInstructions).toHaveLength(2);
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0].questions[0].options).toEqual(['Newton', 'Joule', 'Pascal', 'Watt']);
    expect(parsed.parseWarnings).toEqual([]);
  });

  test('auto-fixes duplicate question numbers, missing marks, and unlabeled options', () => {
    const parsed = parseMarkdownPaper(`
# Mock Paper
**Board:** JEE Mains | **Level:** Competitive Exam | **Subject:** Chemistry
**Time:** 3 hours | **Total Marks:** 8

## General Instructions
1. Answer all questions.

## Section A — MCQ (2 × 2 = 4 Marks)
Choose the correct option.

**Q1.** Which is a noble gas?
A. Helium
B. Oxygen
C. Nitrogen
D. Hydrogen

**Q1.** Another MCQ without marks
Option A Neon
Option B Carbon
Option C Sulphur
Option D Chlorine
    `);

    expect(parsed.sections[0].questions[0].number).toBe(1);
    expect(parsed.sections[0].questions[1].number).toBe(2);
    expect(parsed.sections[0].questions[1].marks).toBe(2);
    expect(parsed.sections[0].questions[1].options).toEqual(['Neon', 'Carbon', 'Sulphur', 'Chlorine']);
    expect(parsed.parseWarnings).toEqual(
      expect.arrayContaining([
        'Question 2 was missing marks and was inferred from the section.',
      ])
    );
  });

  test('returns warnings instead of throwing for malformed markdown', () => {
    const parsed = parseMarkdownPaper(`
Badly formatted output

This is still some usable text.
**Q1.** Explain motion
    `);

    expect(parsed.sections).toHaveLength(0);
    expect(parsed.parseWarnings).toEqual(
      expect.arrayContaining([
        'Paper title could not be extracted cleanly.',
        'Header metadata could not be extracted completely.',
        'No sections could be parsed from the generated paper.',
      ])
    );
  });
});
