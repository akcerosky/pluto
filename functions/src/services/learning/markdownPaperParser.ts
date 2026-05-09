import type { ParsedPaper, ParsedPaperQuestion, ParsedPaperSection } from '../../types/index.js';
import { sanitizeQuestionPaperText } from './questionPaperSanitizer.js';

const ENCODING_REPLACEMENTS: Array<[RegExp, string]> = [
  [/â€™/g, "'"],
  [/â€˜/g, "'"],
  [/â€œ/g, '"'],
  [/â€/g, '"'],
  [/â€"/g, '—'],
  [/â€“/g, '–'],
  [/Ã—/g, '×'],
  [/Â·/g, '·'],
];

const normalizeText = (value: string) => sanitizeQuestionPaperText(value).replace(/\s+/g, ' ').trim();

const preprocessMarkdown = (rawMarkdown: string) => {
  let normalized = rawMarkdown.replace(/\r\n?/g, '\n');
  for (const [pattern, replacement] of ENCODING_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalized
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([^\n])\s+(##\s+(?:General Instructions|Section))/gi, '$1\n$2')
    .replace(/([^\n])\s+(\*\*Q\d+\.\*\*)/g, '$1\n$2')
    .replace(/([^\n])\s+(Q\d+\.)\s+/g, '$1\n$2 ')
    .replace(/([^\n])\s+(\d{1,2}\.)\s+(?=[A-Z(])/g, '$1\n$2 ')
    .replace(/\s+(\([A-D]\)\s+)/g, '\n$1')
    .replace(/\s+(\([a-z]\)\s+)/g, '\n$1');

  return normalized.trim();
};

const parseInteger = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Number.parseInt(value.replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const looksLikeOptionLine = (line: string) =>
  /^([A-Da-d][.)]|Option\s*[A-D]|[A-D]\s*[:-])\s+/.test(line) ||
  /^(True|False|Both|Neither)\b/i.test(line);

const addMissingOptionLetters = (lines: string[]) => {
  const nextLines = [...lines];
  let optionCounter = 0;

  for (let index = 0; index < nextLines.length; index += 1) {
    const line = nextLines[index].trim();
    if (/^(?:\*\*)?Q?\d+\.(?:\*\*)?/i.test(line)) {
      optionCounter = 0;
      continue;
    }
    if (/^\([A-D]\)\s+/.test(line)) {
      optionCounter += 1;
      continue;
    }
    if (/^\([a-z]\)\s+/.test(line) || /^##\s+Section/i.test(line) || /^##\s+General Instructions/i.test(line)) {
      optionCounter = 0;
      continue;
    }
    if (optionCounter < 4 && looksLikeOptionLine(line)) {
      const letter = String.fromCharCode(65 + optionCounter);
      nextLines[index] = `(${letter}) ${line.replace(/^([A-Da-d][.)]|Option\s*[A-D]|[A-D]\s*[:-])\s*/i, '').trim()}`;
      optionCounter += 1;
    }
  }

  return nextLines;
};

const renumberQuestionsSequentially = (lines: string[]) => {
  const nextLines = [...lines];
  let expected = 1;

  for (let index = 0; index < nextLines.length; index += 1) {
    const match = nextLines[index].match(/^(?:\*\*)?Q?(\d+)\.(?:\*\*)?(.*)$/i);
    if (!match) continue;
    const remainder = match[2] || '';
    nextLines[index] = `**Q${expected}.**${remainder}`;
    expected += 1;
  }

  return nextLines;
};

const parseHeaderMeta = (line: string, label: string) => {
  const match = line.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^|]+)`, 'i'));
  return match ? normalizeText(match[1]) : null;
};

const parseSectionHeading = (line: string) => {
  const match = line.match(
    /^##\s+(Section[^—–-:]+?)\s*[—–-:]\s*(.+?)\s+\((\d+)\s*[×x]\s*(\d+)\s*=\s*(\d+)\s+Marks?\)\s*$/i
  );
  if (!match) {
    const looseMatch = line.match(/^##\s+(Section.+)$/i);
    if (!looseMatch) return null;
    return {
      name: normalizeText(looseMatch[1]),
      type: '',
      questionCount: null,
      marksPerQuestion: null,
      totalMarks: null,
    };
  }

  return {
    name: normalizeText(match[1]),
    type: normalizeText(match[2]),
    questionCount: parseInteger(match[3]),
    marksPerQuestion: parseInteger(match[4]),
    totalMarks: parseInteger(match[5]),
  };
};

const buildQuestion = ({
  number,
  text,
  marks,
  options,
  subParts,
}: {
  number: number;
  text: string;
  marks: number | null;
  options: string[];
  subParts: string[];
}): ParsedPaperQuestion => ({
  number,
  text: normalizeText(text),
  marks,
  ...(options.length ? { options: options.map(normalizeText) } : {}),
  ...(subParts.length ? { subParts: subParts.map(normalizeText) } : {}),
});

const finalizeQuestion = (
  current: {
    number: number;
    text: string;
    marks: number | null;
    options: string[];
    subParts: string[];
  } | null,
  section: ParsedPaperSection | null,
  warnings: string[]
) => {
  if (!current || !section) return;

  if (!current.text.trim() && current.subParts.length === 0) {
    warnings.push(`Question ${current.number} could not be parsed cleanly.`);
    return;
  }

  const inferredMarks = current.marks ?? section.marksPerQuestion ?? null;
  if (current.marks === null && inferredMarks !== null) {
    warnings.push(`Question ${current.number} was missing marks and was inferred from the section.`);
  }

  if (/mcq|multiple/i.test(section.type) && current.options.length === 0) {
    warnings.push('Some MCQ options could not be parsed.');
  }

  section.questions.push(
    buildQuestion({
      number: current.number,
      text: current.text || current.subParts[0] || '',
      marks: inferredMarks,
      options: current.options,
      subParts: current.subParts,
    })
  );
};

const parseQuestionLine = (line: string) => {
  const match = line.match(
    /^(?:\*\*)?Q?(\d+)\.(?:\*\*)?\s*(.+?)(?:\s+\*?\*?\[(\d+)\s*(?:marks?)?\]\*?\*?)?$/i
  );
  if (!match) return null;

  return {
    number: parseInteger(match[1]) ?? 1,
    text: normalizeText(match[2]),
    marks: parseInteger(match[3]),
  };
};

export const parseMarkdownPaper = (rawMarkdown: string): ParsedPaper => {
  const normalized = preprocessMarkdown(rawMarkdown);
  const baseLines = normalized.split('\n').map((line) => line.trimEnd()).filter((line) => line.trim().length > 0);
  const lines = renumberQuestionsSequentially(addMissingOptionLetters(baseLines));
  const parseWarnings: string[] = [];

  const titleLine = lines.find((line) => /^#\s+/.test(line));
  const metadataLine = lines.find((line) => /\*\*Board:\*\*/i.test(line));
  const timeLine = lines.find((line) => /\*\*Time:\*\*/i.test(line));

  const paper: ParsedPaper = {
    title: titleLine ? normalizeText(titleLine.replace(/^#\s+/, '')) : null,
    board: metadataLine ? parseHeaderMeta(metadataLine, 'Board') : null,
    level: metadataLine ? parseHeaderMeta(metadataLine, 'Level') : null,
    subject: metadataLine ? parseHeaderMeta(metadataLine, 'Subject') : null,
    duration: timeLine ? parseHeaderMeta(timeLine, 'Time') : null,
    totalMarks: timeLine ? parseInteger(parseHeaderMeta(timeLine, 'Total Marks') ?? undefined) : null,
    generalInstructions: [],
    sections: [],
    parseWarnings,
  };

  let currentSection: ParsedPaperSection | null = null;
  let currentQuestion: {
    number: number;
    text: string;
    marks: number | null;
    options: string[];
    subParts: string[];
  } | null = null;
  let inInstructions = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^##\s+General Instructions/i.test(line)) {
      finalizeQuestion(currentQuestion, currentSection, parseWarnings);
      currentQuestion = null;
      inInstructions = true;
      continue;
    }

    const sectionHeading = parseSectionHeading(line);
    if (sectionHeading) {
      finalizeQuestion(currentQuestion, currentSection, parseWarnings);
      currentQuestion = null;
      inInstructions = false;
      currentSection = {
        ...sectionHeading,
        instructions: '',
        questions: [],
      };
      paper.sections.push(currentSection);
      continue;
    }

    if (inInstructions) {
      const instructionMatch = line.match(/^\d+\.\s+(.+)$/);
      if (instructionMatch) {
        paper.generalInstructions.push(normalizeText(instructionMatch[1]));
      }
      continue;
    }

    const parsedQuestion = parseQuestionLine(line);
    if (parsedQuestion) {
      finalizeQuestion(currentQuestion, currentSection, parseWarnings);
      currentQuestion = {
        ...parsedQuestion,
        options: [],
        subParts: [],
      };
      continue;
    }

    if (!currentSection) {
      continue;
    }

    if (!currentQuestion) {
      currentSection.instructions = normalizeText([currentSection.instructions || '', line].filter(Boolean).join(' '));
      continue;
    }

    const optionMatch = line.match(/^\(([A-D])\)\s+(.+)$/);
    if (optionMatch) {
      currentQuestion.options.push(optionMatch[2]);
      continue;
    }

    const subPartMatch = line.match(/^\(([a-z])\)\s+(.+)$/);
    if (subPartMatch) {
      currentQuestion.subParts.push(subPartMatch[2]);
      continue;
    }

    currentQuestion.text = normalizeText(`${currentQuestion.text} ${line}`);
  }

  finalizeQuestion(currentQuestion, currentSection, parseWarnings);

  if (!paper.title) parseWarnings.push('Paper title could not be extracted cleanly.');
  if (!paper.board || !paper.level || !paper.subject) {
    parseWarnings.push('Header metadata could not be extracted completely.');
  }
  if (paper.sections.length === 0) {
    parseWarnings.push('No sections could be parsed from the generated paper.');
  }

  return paper;
};
