import type { QuestionPaperDoc } from '../../types/index.js';

const escapePdfText = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r?\n/g, ' ');

const buildPaperLines = (paper: QuestionPaperDoc) => {
  const lines = [
    `${paper.examBoard} - ${paper.educationLevel} Examination`,
    `Subject: ${paper.subject}`,
    `Time Allowed: ${paper.format.duration}    Maximum Marks: ${paper.format.totalMarks}`,
    'General Instructions:',
  ];

  for (const section of paper.format.sections) {
    lines.push(`${section.name} - ${section.questionType}`);
    lines.push(section.instructions);
    const questions = paper.questions.filter((question) => question.sectionName === section.name);
    for (const question of questions) {
      lines.push(`Q${question.questionNumber}. ${question.text} [${question.marks}]`);
      for (const option of question.options ?? []) {
        lines.push(`- ${option}`);
      }
      for (const part of question.subParts ?? []) {
        lines.push(`* ${part}`);
      }
    }
  }

  if (paper.webSearchSources?.length) {
    lines.push('Sources:');
    lines.push(...paper.webSearchSources);
  }

  return lines;
};

export const generateQuestionPaperPdfBase64 = (paper: QuestionPaperDoc) => {
  const lines = buildPaperLines(paper);
  const textCommands = ['BT', '/F1 11 Tf', '50 780 Td', '14 TL'];
  for (const line of lines.slice(0, 220)) {
    textCommands.push(`(${escapePdfText(line)}) Tj`);
    textCommands.push('T*');
  }
  textCommands.push('ET');
  const stream = textCommands.join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf8').toString('base64');
};
