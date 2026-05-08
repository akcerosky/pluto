export type QuestionPaperSelectOption = {
  label: string;
  value: string;
  requiresCustomInput?: boolean;
  customPlaceholder?: string;
};

export type QuestionPaperOptionGroup = {
  label: string;
  options: QuestionPaperSelectOption[];
};

export const DEFAULT_QUESTION_PAPER_EDUCATION_LEVEL = 'Class 10';
export const DEFAULT_QUESTION_PAPER_EXAM_BOARD = 'CBSE';

const EDUCATION_LEVEL_CUSTOM_PLACEHOLDER = 'e.g. BPT, Diploma in Pharmacy, CFP';
const STATE_BOARD_PLACEHOLDER =
  'e.g. Maharashtra State Board, Tamil Nadu State Board, UP Board';
const OTHER_BOARD_PLACEHOLDER =
  'e.g. Mumbai University, Anna University, AIIMS Internal';

export const QUESTION_PAPER_EDUCATION_LEVEL_GROUPS: QuestionPaperOptionGroup[] = [
  {
    label: 'School',
    options: [
      { label: 'Class 6', value: 'Class 6' },
      { label: 'Class 7', value: 'Class 7' },
      { label: 'Class 8', value: 'Class 8' },
      { label: 'Class 9', value: 'Class 9' },
      { label: 'Class 10', value: 'Class 10' },
      { label: 'Class 11', value: 'Class 11' },
      { label: 'Class 12', value: 'Class 12' },
    ],
  },
  {
    label: 'Undergraduate',
    options: [
      { label: 'B.Tech / B.E.', value: 'B.Tech / B.E.' },
      { label: 'MBBS / BDS', value: 'MBBS / BDS' },
      { label: 'B.Sc', value: 'B.Sc' },
      { label: 'B.Com', value: 'B.Com' },
      { label: 'B.A', value: 'B.A' },
      { label: 'BBA', value: 'BBA' },
      { label: 'B.Arch', value: 'B.Arch' },
      { label: 'B.Pharm', value: 'B.Pharm' },
      { label: 'LLB', value: 'LLB' },
      { label: 'BCA', value: 'BCA' },
      { label: 'B.Ed', value: 'B.Ed' },
      { label: 'Nursing (GNM/BSc)', value: 'Nursing (GNM/BSc)' },
    ],
  },
  {
    label: 'Postgraduate',
    options: [
      { label: 'M.Tech / M.E.', value: 'M.Tech / M.E.' },
      { label: 'MD / MS (Medical)', value: 'MD / MS (Medical)' },
      { label: 'M.Sc', value: 'M.Sc' },
      { label: 'M.Com', value: 'M.Com' },
      { label: 'MBA', value: 'MBA' },
      { label: 'MA', value: 'MA' },
      { label: 'LLM', value: 'LLM' },
      { label: 'MCA', value: 'MCA' },
      { label: 'M.Pharm', value: 'M.Pharm' },
    ],
  },
  {
    label: 'Competitive Exams',
    options: [
      { label: 'JEE Mains', value: 'JEE Mains' },
      { label: 'JEE Advanced', value: 'JEE Advanced' },
      { label: 'NEET UG', value: 'NEET UG' },
      { label: 'NEET PG', value: 'NEET PG' },
      { label: 'UPSC CSE', value: 'UPSC CSE' },
      { label: 'UPSC IFoS', value: 'UPSC IFoS' },
      { label: 'CAT', value: 'CAT' },
      { label: 'CLAT', value: 'CLAT' },
      { label: 'GATE', value: 'GATE' },
      { label: 'CA Foundation', value: 'CA Foundation' },
      { label: 'CA Intermediate', value: 'CA Intermediate' },
      { label: 'CA Final', value: 'CA Final' },
      { label: 'CS Foundation', value: 'CS Foundation' },
      { label: 'CS Executive', value: 'CS Executive' },
      { label: 'CMA', value: 'CMA' },
      { label: 'CUET', value: 'CUET' },
      { label: 'IELTS', value: 'IELTS' },
      { label: 'GMAT', value: 'GMAT' },
      { label: 'GRE', value: 'GRE' },
      { label: 'SAT', value: 'SAT' },
    ],
  },
  {
    label: 'Professional / Other',
    options: [
      {
        label: 'Custom (specify below)',
        value: 'Custom (specify below)',
        requiresCustomInput: true,
        customPlaceholder: EDUCATION_LEVEL_CUSTOM_PLACEHOLDER,
      },
    ],
  },
];

export const QUESTION_PAPER_EXAM_BOARD_GROUPS: QuestionPaperOptionGroup[] = [
  {
    label: 'School Boards',
    options: [
      { label: 'CBSE', value: 'CBSE' },
      { label: 'ICSE', value: 'ICSE' },
      { label: 'IGCSE', value: 'IGCSE' },
      { label: 'IB', value: 'IB' },
      {
        label: 'State Board (specify)',
        value: 'State Board (specify)',
        requiresCustomInput: true,
        customPlaceholder: STATE_BOARD_PLACEHOLDER,
      },
      { label: 'Cambridge O/A Level', value: 'Cambridge O/A Level' },
    ],
  },
  {
    label: 'University Exams',
    options: [
      { label: 'University Internal Exam', value: 'University Internal Exam' },
      { label: 'University End Semester', value: 'University End Semester' },
      { label: 'University Mid Semester', value: 'University Mid Semester' },
      { label: 'Autonomous College Exam', value: 'Autonomous College Exam' },
    ],
  },
  {
    label: 'Competitive',
    options: [
      { label: 'NTA', value: 'NTA' },
      { label: 'UPSC', value: 'UPSC' },
      { label: 'SSC', value: 'SSC' },
      { label: 'IBPS', value: 'IBPS' },
      { label: 'RBI', value: 'RBI' },
      { label: 'SEBI', value: 'SEBI' },
      { label: 'ISRO', value: 'ISRO' },
      { label: 'DRDO', value: 'DRDO' },
      { label: 'State PSC', value: 'State PSC' },
    ],
  },
  {
    label: 'Professional Bodies',
    options: [
      { label: 'ICAI (CA)', value: 'ICAI (CA)' },
      { label: 'ICSI (CS)', value: 'ICSI (CS)' },
      { label: 'ICMAI (CMA)', value: 'ICMAI (CMA)' },
      { label: 'NMC (MBBS)', value: 'NMC (MBBS)' },
      { label: 'Bar Council (Law)', value: 'Bar Council (Law)' },
      { label: 'AICTE (Engineering)', value: 'AICTE (Engineering)' },
    ],
  },
  {
    label: 'Custom',
    options: [
      {
        label: 'Other (specify below)',
        value: 'Other (specify below)',
        requiresCustomInput: true,
        customPlaceholder: OTHER_BOARD_PLACEHOLDER,
      },
    ],
  },
];

const flattenOptions = (groups: QuestionPaperOptionGroup[]) =>
  groups.flatMap((group) => group.options);

const EDUCATION_LEVEL_OPTIONS = flattenOptions(QUESTION_PAPER_EDUCATION_LEVEL_GROUPS);
const EXAM_BOARD_OPTIONS = flattenOptions(QUESTION_PAPER_EXAM_BOARD_GROUPS);

const optionLookup = (options: QuestionPaperSelectOption[], value: string) =>
  options.find((option) => option.value === value);

export const getQuestionPaperEducationLevelOption = (value: string) =>
  optionLookup(EDUCATION_LEVEL_OPTIONS, value);

export const getQuestionPaperExamBoardOption = (value: string) =>
  optionLookup(EXAM_BOARD_OPTIONS, value);

export const questionPaperEducationLevelRequiresCustomInput = (value: string) =>
  Boolean(getQuestionPaperEducationLevelOption(value)?.requiresCustomInput);

export const questionPaperExamBoardRequiresCustomInput = (value: string) =>
  Boolean(getQuestionPaperExamBoardOption(value)?.requiresCustomInput);

export const getQuestionPaperEducationLevelPlaceholder = (value: string) =>
  getQuestionPaperEducationLevelOption(value)?.customPlaceholder ?? EDUCATION_LEVEL_CUSTOM_PLACEHOLDER;

export const getQuestionPaperExamBoardPlaceholder = (value: string) =>
  getQuestionPaperExamBoardOption(value)?.customPlaceholder ?? OTHER_BOARD_PLACEHOLDER;

export const resolveQuestionPaperSelectValue = (selectedValue: string, customValue: string, requiresCustomInput: boolean) =>
  requiresCustomInput ? customValue.trim() : selectedValue;
