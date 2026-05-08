export type AcademicCategory = 'school' | 'undergraduate' | 'postgraduate' | 'competitive';

export type AcademicStepOneOption = {
  id: string;
  label: string;
  category: AcademicCategory;
};

export type AcademicStepOption = {
  label: string;
  value: string;
  requiresCustomInput?: boolean;
  customPlaceholder?: string;
};

export type AcademicSelectionState = {
  stepOneId: string;
  specificLevel: string;
  boardExam: string;
  customBoardExam: string;
};

const OTHER_EXAM_PLACEHOLDER = 'e.g. State Engineering Entrance';

export const STEP_ONE_OPTIONS: AcademicStepOneOption[] = [
  { id: 'school', label: 'School', category: 'school' },
  { id: 'undergraduate', label: 'Undergraduate', category: 'undergraduate' },
  { id: 'postgraduate', label: 'Postgraduate', category: 'postgraduate' },
  { id: 'competitive', label: 'Competitive Exam', category: 'competitive' },
];

const SCHOOL_SPECIFIC_LEVELS = [
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'Class 10',
  'Class 11',
  'Class 12',
];

const UNDERGRAD_SPECIFIC_LEVELS = [
  'B.Tech/B.E.',
  'MBBS/BDS',
  'B.Sc',
  'B.Com',
  'B.A',
  'BBA',
  'LLB',
  'BCA',
  'B.Pharm',
  'Nursing',
];

const POSTGRAD_SPECIFIC_LEVELS = [
  'M.Tech/M.E.',
  'MD/MS',
  'M.Sc',
  'M.Com',
  'MBA',
  'LLM',
  'MCA',
  'M.Pharm',
];

const SCHOOL_BOARDS: AcademicStepOption[] = [
  { label: 'CBSE', value: 'CBSE' },
  { label: 'ICSE', value: 'ICSE' },
  { label: 'IGCSE', value: 'IGCSE' },
  { label: 'IB', value: 'IB' },
  { label: 'Cambridge O/A Level', value: 'Cambridge O/A Level' },
  { label: 'State Board', value: 'State Board' },
];

const UNIVERSITY_BOARDS: AcademicStepOption[] = [
  { label: 'University Internal', value: 'University Internal' },
  { label: 'End Semester', value: 'End Semester' },
  { label: 'Mid Semester', value: 'Mid Semester' },
];

const COMPETITIVE_EXAMS: AcademicStepOption[] = [
  { label: 'JEE Mains', value: 'JEE Mains' },
  { label: 'JEE Advanced', value: 'JEE Advanced' },
  { label: 'NEET UG', value: 'NEET UG' },
  { label: 'NEET PG', value: 'NEET PG' },
  { label: 'UPSC CSE', value: 'UPSC CSE' },
  { label: 'CAT', value: 'CAT' },
  { label: 'CLAT', value: 'CLAT' },
  { label: 'GATE', value: 'GATE' },
  { label: 'CA Foundation', value: 'CA Foundation' },
  { label: 'CA Intermediate', value: 'CA Intermediate' },
  { label: 'CA Final', value: 'CA Final' },
  { label: 'CUET', value: 'CUET' },
  { label: 'SAT', value: 'SAT' },
  { label: 'GRE', value: 'GRE' },
  { label: 'GMAT', value: 'GMAT' },
  { label: 'IELTS', value: 'IELTS' },
  { label: 'State PSC', value: 'State PSC' },
  {
    label: 'Other',
    value: 'Other',
    requiresCustomInput: true,
    customPlaceholder: OTHER_EXAM_PLACEHOLDER,
  },
];

export const DEFAULT_ACADEMIC_SELECTION: AcademicSelectionState = {
  stepOneId: '',
  specificLevel: '',
  boardExam: '',
  customBoardExam: '',
};

export const getStepOneOption = (stepOneId: string) =>
  STEP_ONE_OPTIONS.find((option) => option.id === stepOneId) ?? STEP_ONE_OPTIONS[0];

export const shouldSkipSpecificLevelStep = (selection: AcademicSelectionState) =>
  getStepOneOption(selection.stepOneId).category === 'competitive';

export const getSpecificLevelOptions = (selection: AcademicSelectionState) => {
  const option = getStepOneOption(selection.stepOneId);
  switch (option.category) {
    case 'school':
      return SCHOOL_SPECIFIC_LEVELS;
    case 'undergraduate':
      return UNDERGRAD_SPECIFIC_LEVELS;
    case 'postgraduate':
      return POSTGRAD_SPECIFIC_LEVELS;
    case 'competitive':
    default:
      return [];
  }
};

export const getBoardExamOptions = (selection: AcademicSelectionState) => {
  const option = getStepOneOption(selection.stepOneId);
  switch (option.category) {
    case 'school':
      return SCHOOL_BOARDS;
    case 'undergraduate':
    case 'postgraduate':
      return UNIVERSITY_BOARDS;
    case 'competitive':
    default:
      return COMPETITIVE_EXAMS;
  }
};

export const getBoardExamOption = (selection: AcademicSelectionState) =>
  getBoardExamOptions(selection).find((option) => option.value === selection.boardExam);

export const getResolvedAcademicSelection = (selection: AcademicSelectionState) => {
  const stepOne = getStepOneOption(selection.stepOneId);
  const boardOption = getBoardExamOption(selection);
  const resolvedBoardExam = boardOption?.requiresCustomInput
    ? selection.customBoardExam.trim()
    : selection.boardExam.trim();

  let educationLevel = '';
  switch (stepOne.category) {
    case 'school':
      educationLevel = selection.specificLevel.trim();
      break;
    case 'undergraduate':
    case 'postgraduate':
      educationLevel = `${stepOne.label} ${selection.specificLevel.trim()}`.trim();
      break;
    case 'competitive':
      educationLevel = 'Competitive Exam';
      break;
  }

  return {
    educationLevel,
    examBoard: resolvedBoardExam,
    isComplete: Boolean(
      selection.stepOneId &&
        (shouldSkipSpecificLevelStep(selection) || selection.specificLevel.trim()) &&
        selection.boardExam.trim() &&
        resolvedBoardExam
    ),
  };
};
