import { lazy } from 'react';

export const LazyProjectsModal = lazy(() =>
  import('../Modals/ProjectsModal').then((module) => ({ default: module.ProjectsModal }))
);

export const LazyConversationalModeUI = lazy(() =>
  import('../Modes/ModeSpecializations').then((module) => ({ default: module.ConversationalModeUI }))
);

export const LazyHomeworkModeUI = lazy(() =>
  import('../Modes/ModeSpecializations').then((module) => ({ default: module.HomeworkModeUI }))
);

export const LazyExamPrepUI = lazy(() =>
  import('../Modes/ModeSpecializations').then((module) => ({ default: module.ExamPrepUI }))
);

export const LazyAssistantMessageContent = lazy(() =>
  import('./AssistantMessageContent').then((module) => ({ default: module.AssistantMessageContent }))
);
