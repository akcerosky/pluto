import { generateQuestionPaperPdfBase64 } from './pdfGenerator.js';

describe('generateQuestionPaperPdfBase64', () => {
  test('renders exam-specific section instructions, MCQ options, and footer text', () => {
    const base64 = generateQuestionPaperPdfBase64({
      id: 'paper-1',
      title: 'JEE Mains Physics Exam',
      subject: 'Physics',
      educationLevel: 'Competitive Exam',
      examBoard: 'CBSE',
      headerBoardName: 'CBSE',
      examinationTitle: 'JEE Mains Examination',
      sessionLabel: '2026',
      subjectCode: 'PHY-101',
      generalInstructions: ['All questions are compulsory.', 'Use pi, sqrtx, and Rs. where required.'],
      matchedFormatFamily: 'competitive_exam',
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
            negativeMarking: -0.25,
          },
          {
            name: 'SECTION B',
            displayName: 'SECTION B',
            instructions: 'Attempt any 1 out of 2 questions.',
            questionType: 'Numerical Answer Type',
            questionTypeDisplay: 'Numerical Answer Type',
            questions: 2,
            marksPerQuestion: 6,
            totalMarks: 12,
            attemptRequired: 1,
          },
        ],
      },
      questions: [
        {
          id: 'q-1',
          sectionName: 'SECTION A',
          questionNumber: 1,
          text: 'What is pi?',
          type: 'mcq',
          marks: 1,
          options: ['3.14', '2.71', '1.41', '0'],
        },
        {
          id: 'q-2',
          sectionName: 'SECTION A',
          questionNumber: 2,
          text: 'Find sqrt16.',
          type: 'mcq',
          marks: 1,
          options: ['2', '4', '8', '16'],
        },
        {
          id: 'q-3',
          sectionName: 'SECTION B',
          questionNumber: 3,
          text: 'Explain how a resistor of 10^2 ohms behaves at 30deg C and costs Rs.5.',
          type: 'short_answer',
          marks: 6,
          subParts: ['State the formula.', 'Solve using sqrt9.', 'Comment if a != b.'],
        },
        {
          id: 'q-4',
          sectionName: 'SECTION B',
          questionNumber: 4,
          text: 'Discuss energy conservation with sumF = 0 and x >= y.',
          type: 'short_answer',
          marks: 6,
        },
      ],
      generatedAt: new Date().toISOString(),
      status: 'ready',
      webSearchSources: ['https://example.com/cbse'],
    });

    const pdfText = Buffer.from(base64, 'base64').toString('utf8');
    expect(pdfText).toContain('SECTION A - Multiple Choice Questions');
    expect(pdfText).toContain('SECTION B - Numerical Answer Type');
    expect(pdfText).toContain('\\(A\\) 3.14');
    expect(pdfText).toContain('\\(B\\) 4');
    expect(pdfText).toContain('Negative marking: -0.25');
    expect(pdfText).toContain('Attempt any 1 of 2');
    expect(pdfText).toContain('Physics - CBSE 2026');
    expect(pdfText).toContain('Page 1 of 2');
    expect(pdfText).toContain('Page 2 of 2');
    expect(pdfText).toContain('Comment if a != b.');
    expect(pdfText).toContain('sumF = 0 and x >= y.');
  });
});
