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
const stripUnsupportedControlChars = (value) => Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    const isUnsupportedControl = (code >= 0x00 && code <= 0x08) ||
        code === 0x0b ||
        code === 0x0c ||
        (code >= 0x0e && code <= 0x1f) ||
        code === 0x7f;
    return isUnsupportedControl ? ' ' : character;
}).join('');
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
