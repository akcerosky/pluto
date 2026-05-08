const SMART_PUNCTUATION_REPLACEMENTS = [
    [/[\u2018\u2019\u2032]/g, "'"],
    [/[\u201C\u201D\u2033]/g, '"'],
    [/[\u2013\u2014]/g, ' - '],
];
const COMMON_MOJIBAKE_REPLACEMENTS = [
    [/donât/g, "don't"],
    [/canât/g, "can't"],
    [/wonât/g, "won't"],
    [/nât/g, "n't"],
    [/â€™/g, "'"],
    [/â€œ/g, '"'],
    [/â€/g, '"'],
    [/â€"/g, ' - '],
    [/â€“/g, ' - '],
    [/â€¢/g, '-'],
    [/Â·/g, '-'],
    [/Â/g, ''],
];
// Built-in Helvetica does not support many exam symbols reliably in this custom PDF writer,
// so we normalize them to readable ASCII equivalents before writing the PDF stream.
export const PDF_SYMBOL_FALLBACKS = {
    '₹': 'Rs.',
    '°C': 'deg C',
    '°F': 'deg F',
    '°': 'deg',
    '²': '^2',
    '³': '^3',
    '√': 'sqrt',
    '∑': 'sum',
    'π': 'pi',
    '∞': 'infinity',
    '≥': '>=',
    '≤': '<=',
    '≠': '!=',
};
const stripUnsupportedControlChars = (value) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
const replaceAll = (value, replacements) => replacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
export const normalizeQuestionPaperWhitespace = (value) => value.replace(/\s+/g, ' ').trim();
export const sanitizeQuestionPaperText = (value) => {
    const normalized = replaceAll(stripUnsupportedControlChars(value), SMART_PUNCTUATION_REPLACEMENTS);
    const repaired = replaceAll(normalized, COMMON_MOJIBAKE_REPLACEMENTS);
    return normalizeQuestionPaperWhitespace(repaired);
};
export const sanitizePdfRenderableText = (value) => {
    let next = sanitizeQuestionPaperText(value);
    for (const [symbol, replacement] of Object.entries(PDF_SYMBOL_FALLBACKS)) {
        next = next.split(symbol).join(replacement);
    }
    return normalizeQuestionPaperWhitespace(next);
};
