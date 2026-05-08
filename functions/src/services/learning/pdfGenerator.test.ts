import { generateQuestionPaperPdfBase64 } from './pdfGenerator.js';

describe('generateQuestionPaperPdfBase64', () => {
  test('renders multi-section papers with footer text and sanitized symbols', () => {
    const base64 = generateQuestionPaperPdfBase64({
      id: 'paper-1',
      title: 'Class 10 CBSE Physics Exam',
      subject: 'Physics',
      educationLevel: 'Class 10',
      examBoard: 'CBSE',
      headerBoardName: 'CBSE',
      examinationTitle: 'Class 10 Examination',
      sessionLabel: '2026',
      subjectCode: 'PHY-101',
      generalInstructions: ['All questions are compulsory.', 'Use π, √x, and ₹ where required.'],
      matchedFormatFamily: 'school_board',
      formatSource: 'official',
      sourceType: 'topic',
      format: {
        totalMarks: 14,
        duration: '3 hours',
        sections: [
          {
            name: 'SECTION A',
            displayName: 'SECTION A',
            instructions: 'Answer all questions.',
            questionType: 'Multiple Choice Questions',
            questionTypeDisplay: 'Multiple Choice Questions',
            questions: 2,
            marksPerQuestion: 1,
            totalMarks: 2,
          },
          {
            name: 'SECTION B',
            displayName: 'SECTION B',
            instructions: 'Answer all long answer questions.',
            questionType: 'Long Answer Questions',
            questionTypeDisplay: 'Long Answer Questions',
            questions: 2,
            marksPerQuestion: 6,
            totalMarks: 12,
          },
        ],
      },
      questions: [
        {
          id: 'q-1',
          sectionName: 'SECTION A',
          questionNumber: 1,
          text: 'What is π?',
          type: 'mcq',
          marks: 1,
          options: ['3.14', '2.71', '1.41', '0'],
        },
        {
          id: 'q-2',
          sectionName: 'SECTION A',
          questionNumber: 2,
          text: 'Find √16.',
          type: 'mcq',
          marks: 1,
          options: ['2', '4', '8', '16'],
        },
        {
          id: 'q-3',
          sectionName: 'SECTION B',
          questionNumber: 3,
          text: 'Explain how a resistor of 10² ohms behaves at 30°C and costs ₹5.',
          type: 'long_answer',
          marks: 6,
          subParts: ['State the formula.', 'Solve using √9.', 'Comment if a ≠ b.'],
        },
        {
          id: 'q-4',
          sectionName: 'SECTION B',
          questionNumber: 4,
          text: 'Discuss energy conservation with ∑F = 0 and x ≥ y.',
          type: 'long_answer',
          marks: 6,
        },
      ],
      generatedAt: new Date().toISOString(),
      status: 'ready',
      webSearchSources: ['https://example.com/cbse'],
    });

    const pdfText = Buffer.from(base64, 'base64').toString('utf8');
    expect(pdfText).toContain('SECTION A - Multiple Choice Questions');
    expect(pdfText).toContain('SECTION B - Long Answer Questions');
    expect(pdfText).toContain('Page 1 of 1');
    expect(pdfText).toContain('PHY-101 - CBSE 2026');
    expect(pdfText).toContain('Use pi, sqrtx, and Rs. where required.');
    expect(pdfText).toContain('10^2 ohms behaves at 30deg C and costs Rs.5');
    expect(pdfText).toContain('Comment if a != b.');
    expect(pdfText).toContain('sumF = 0 and x >= y.');
  });
});
