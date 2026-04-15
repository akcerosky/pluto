const toSafeNonNegativeInteger = (value: unknown, fallback = 0) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
};

export const formatTokenCount = (value: unknown) => {
  const safeValue = toSafeNonNegativeInteger(value);

  if (safeValue >= 1_000_000) {
    const millions = safeValue / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1).replace(/\.0$/, '')}M`;
  }

  if (safeValue >= 1_000) {
    const thousands = safeValue / 1_000;
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1).replace(/\.0$/, '')}k`;
  }

  return new Intl.NumberFormat('en-IN').format(safeValue);
};

export const formatTokenUsageSummary = (
  remainingTodayTokens: unknown,
  estimatedMessagesLeft: unknown
) => {
  const safeTokens = toSafeNonNegativeInteger(remainingTodayTokens);
  const safeMessages = toSafeNonNegativeInteger(estimatedMessagesLeft);
  return `approx ${safeMessages} messages left (${formatTokenCount(safeTokens)} tokens)`;
};
