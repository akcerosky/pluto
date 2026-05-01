import { lazy, Suspense } from 'react';

const AssistantMarkdownRenderer = lazy(() =>
  import('./AssistantMarkdownRenderer').then((module) => ({ default: module.AssistantMarkdownRenderer }))
);

const normalizeMathDelimiters = (text: string) =>
  text
    .replace(/\\\[(.*?)\\\]/gs, (_, expression: string) => `\n$$\n${expression.trim()}\n$$\n`)
    .replace(/\\\((.*?)\\\)/gs, (_, expression: string) => `$${expression.trim()}$`);

const indentDisplayMathWithinListItems = (text: string) => {
  const lines = text.split('\n');
  const normalizedLines: string[] = [];
  let shouldIndentFollowingDisplayMath = false;
  let insideIndentedDisplayMath = false;
  const listContinuationIndent = '    ';

  for (const line of lines) {
    const isListHeading = /^\s*(?:[-*+]|\d+\.)\s+.+:\s*$/.test(line);
    const trimmedLine = line.trim();
    const startsDisplayMath = trimmedLine === '$$';

    if (isListHeading) {
      shouldIndentFollowingDisplayMath = true;
      insideIndentedDisplayMath = false;
      normalizedLines.push(line);
      continue;
    }

    if (shouldIndentFollowingDisplayMath && trimmedLine === '') {
      normalizedLines.push(line);
      continue;
    }

    if (shouldIndentFollowingDisplayMath && startsDisplayMath) {
      insideIndentedDisplayMath = true;
      normalizedLines.push(`${listContinuationIndent}${trimmedLine}`);
      continue;
    }

    if (insideIndentedDisplayMath) {
      normalizedLines.push(`${listContinuationIndent}${trimmedLine}`);
      if (startsDisplayMath) {
        insideIndentedDisplayMath = false;
        shouldIndentFollowingDisplayMath = false;
      }
      continue;
    }

    shouldIndentFollowingDisplayMath = false;
    normalizedLines.push(line);
  }

  return normalizedLines.join('\n');
};

export const AssistantMessageContent = ({ text }: { text: string }) => {
  const normalizedText = indentDisplayMathWithinListItems(normalizeMathDelimiters(text));

  return (
    <Suspense fallback={<div className="markdown-content" style={{ whiteSpace: 'pre-wrap' }}>{normalizedText}</div>}>
      <AssistantMarkdownRenderer text={normalizedText} />
    </Suspense>
  );
};
