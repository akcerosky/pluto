import type { CSSProperties } from 'react';
import {
  type AcademicSelectionState,
  getBoardExamOption,
  getBoardExamOptions,
  getStepOneOption,
  getSpecificLevelOptions,
  shouldSkipSpecificLevelStep,
  STEP_ONE_OPTIONS,
} from '../../lib/questionPaperFormOptions';

interface CascadingAcademicSelectorProps {
  selection: AcademicSelectionState;
  onChange: (selection: AcademicSelectionState) => void;
}

const updateSelection = (
  selection: AcademicSelectionState,
  patch: Partial<AcademicSelectionState>
): AcademicSelectionState => ({
  ...selection,
  ...patch,
});

export const CascadingAcademicSelector = ({
  selection,
  onChange,
}: CascadingAcademicSelectorProps) => {
  const stepOneOption = selection.stepOneId ? getStepOneOption(selection.stepOneId) : null;
  const specificOptions = getSpecificLevelOptions(selection);
  const boardOptions = getBoardExamOptions(selection);
  const boardOption = getBoardExamOption(selection);
  const skipSpecificLevelStep = shouldSkipSpecificLevelStep(selection);
  const specificLevelPlaceholder =
    stepOneOption?.category === 'school'
      ? 'Choose class'
      : stepOneOption?.category === 'undergraduate' || stepOneOption?.category === 'postgraduate'
        ? 'Choose course'
        : 'Not needed';

  return (
    <div style={shellStyle}>
      <div style={fieldShellStyle}>
        <select
          id="academic-level"
          value={selection.stepOneId}
          onChange={(event) =>
            onChange({
              stepOneId: event.target.value,
              specificLevel: '',
              boardExam: '',
              customBoardExam: '',
            })
          }
          style={selectStyle}
        >
          <option value="">Select level</option>
          {STEP_ONE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div style={fieldShellStyle}>
        <select
          id="academic-specific-level"
          value={selection.specificLevel}
          onChange={(event) =>
            onChange(updateSelection(selection, {
              specificLevel: event.target.value,
              boardExam: '',
              customBoardExam: '',
            }))
          }
          style={{
            ...selectStyle,
            ...(!selection.stepOneId || skipSpecificLevelStep ? disabledSelectStyle : null),
          }}
          disabled={!selection.stepOneId || skipSpecificLevelStep}
        >
          <option value="">{specificLevelPlaceholder}</option>
          {specificOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div style={boardFieldStyle}>
        <div style={fieldShellStyle}>
          {boardOption?.requiresCustomInput ? (
            <div style={customBoardInputShellStyle}>
              <input
                id="academic-board-exam"
                value={selection.customBoardExam}
                onChange={(event) =>
                  onChange(updateSelection(selection, { customBoardExam: event.target.value }))
                }
                placeholder={boardOption.customPlaceholder}
                style={{
                  ...selectStyle,
                  ...customFieldStyle,
                }}
              />
              <button
                type="button"
                onClick={() =>
                  onChange(updateSelection(selection, {
                    boardExam: '',
                    customBoardExam: '',
                  }))
                }
                style={inlineResetButtonStyle}
                aria-label="Choose board or exam from list"
              >
                Change
              </button>
            </div>
          ) : (
            <select
              id="academic-board-exam"
              value={selection.boardExam}
              onChange={(event) =>
                onChange(updateSelection(selection, {
                  boardExam: event.target.value,
                  customBoardExam: '',
                }))
              }
              style={{
                ...selectStyle,
                ...(!selection.stepOneId || (!skipSpecificLevelStep && !selection.specificLevel)
                  ? disabledSelectStyle
                  : null),
              }}
              disabled={!selection.stepOneId || (!skipSpecificLevelStep && !selection.specificLevel)}
            >
              <option value="">Select board or exam</option>
              {boardOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
};

const shellStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '10px',
  width: '100%',
  alignItems: 'start',
};

const fieldShellStyle: CSSProperties = {
  display: 'grid',
  minWidth: 0,
};

const boardFieldStyle: CSSProperties = {
  display: 'grid',
  minWidth: 0,
};

const selectStyle: CSSProperties = {
  minHeight: '46px',
  borderRadius: '18px',
  border: '1px solid var(--glass-border)',
  background: 'var(--glass-bg)',
  color: 'var(--text-primary)',
  padding: '0 14px',
  width: '100%',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
};

const disabledSelectStyle: CSSProperties = {
  opacity: 0.62,
  color: 'var(--text-secondary)',
  background: 'color-mix(in srgb, var(--glass-bg) 78%, transparent)',
};

const customFieldStyle: CSSProperties = {
  background: 'color-mix(in srgb, var(--glass-bg) 88%, transparent)',
  paddingRight: '88px',
};

const inlineResetButtonStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  right: '10px',
  transform: 'translateY(-50%)',
  minHeight: '28px',
  padding: '0 10px',
  borderRadius: '999px',
  border: '1px solid var(--glass-border)',
  background: 'var(--glass-bg-subtle)',
  color: 'var(--text-secondary)',
  fontSize: '0.72rem',
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

const customBoardInputShellStyle: CSSProperties = {
  position: 'relative',
};
