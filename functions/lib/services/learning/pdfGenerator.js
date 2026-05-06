const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 54;
const TOP_MARGIN = 56;
const BOTTOM_MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const escapePdfText = (value) => value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r?\n/g, ' ');
const normalizeInlineText = (value) => value.replace(/\s+/g, ' ').trim();
const estimateLineWidth = (text, fontSize) => text.length * fontSize * 0.48;
const estimateCharsPerLine = (fontSize, width) => Math.max(16, Math.floor(width / Math.max(fontSize * 0.48, 1)));
const wrapText = (value, fontSize, width) => {
    const text = normalizeInlineText(value);
    if (!text) {
        return [''];
    }
    const maxChars = estimateCharsPerLine(fontSize, width);
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    const pushCurrentLine = () => {
        if (currentLine.trim()) {
            lines.push(currentLine.trim());
            currentLine = '';
        }
    };
    for (const word of words) {
        if (word.length > maxChars) {
            pushCurrentLine();
            let remainder = word;
            while (remainder.length > maxChars) {
                lines.push(remainder.slice(0, maxChars - 1) + '-');
                remainder = remainder.slice(maxChars - 1);
            }
            currentLine = remainder;
            continue;
        }
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (candidate.length <= maxChars) {
            currentLine = candidate;
            continue;
        }
        pushCurrentLine();
        currentLine = word;
    }
    pushCurrentLine();
    return lines.length ? lines : [''];
};
const buildRenderBlocks = (paper) => {
    const blocks = [
        {
            type: 'text',
            text: `${paper.examBoard} ${paper.educationLevel} Examination`,
            font: 'F2',
            fontSize: 12,
            lineHeight: 16,
            align: 'center',
        },
        {
            type: 'text',
            text: paper.title,
            font: 'F2',
            fontSize: 24,
            lineHeight: 30,
            align: 'center',
            spacingBefore: 8,
        },
        {
            type: 'text',
            text: `${paper.subject} • ${paper.examBoard} • ${paper.educationLevel}`,
            font: 'F1',
            fontSize: 12,
            lineHeight: 16,
            align: 'center',
            spacingBefore: 6,
            spacingAfter: 10,
        },
        {
            type: 'rule',
            spacingAfter: 14,
        },
        {
            type: 'text',
            text: `Time Allowed: ${paper.format.duration} • Maximum Marks: ${paper.format.totalMarks}`,
            font: 'F2',
            fontSize: 14,
            lineHeight: 18,
            spacingAfter: 14,
        },
    ];
    for (const section of paper.format.sections) {
        blocks.push({
            type: 'text',
            text: `${section.name} · ${section.questionType}`,
            font: 'F2',
            fontSize: 16,
            lineHeight: 20,
            spacingBefore: 8,
            spacingAfter: 4,
        });
        blocks.push({
            type: 'text',
            text: section.instructions,
            font: 'F1',
            fontSize: 11,
            lineHeight: 15,
            spacingAfter: 8,
        });
        const questions = paper.questions.filter((question) => question.sectionName === section.name);
        for (const question of questions) {
            blocks.push({
                type: 'text',
                text: `${question.questionNumber}. ${question.text} [${question.marks}]`,
                font: 'F1',
                fontSize: 11,
                lineHeight: 16,
                spacingBefore: 4,
            });
            for (const option of question.options ?? []) {
                blocks.push({
                    type: 'text',
                    text: `• ${option}`,
                    font: 'F1',
                    fontSize: 10,
                    lineHeight: 14,
                    indent: 18,
                });
            }
            for (const [index, part] of (question.subParts ?? []).entries()) {
                blocks.push({
                    type: 'text',
                    text: `(${String.fromCharCode(97 + index)}) ${part}`,
                    font: 'F1',
                    fontSize: 10,
                    lineHeight: 14,
                    indent: 18,
                });
            }
        }
    }
    if (paper.webSearchSources?.length) {
        blocks.push({
            type: 'text',
            text: 'Reference Sources',
            font: 'F2',
            fontSize: 14,
            lineHeight: 18,
            spacingBefore: 10,
            spacingAfter: 4,
        });
        for (const source of paper.webSearchSources) {
            blocks.push({
                type: 'text',
                text: `• ${source}`,
                font: 'F1',
                fontSize: 9,
                lineHeight: 12,
                indent: 12,
            });
        }
    }
    return blocks;
};
const buildPageContentStreams = (paper) => {
    const pages = [[]];
    let pageIndex = 0;
    let cursorY = PAGE_HEIGHT - TOP_MARGIN;
    const ensureSpace = (requiredHeight) => {
        if (cursorY - requiredHeight >= BOTTOM_MARGIN) {
            return;
        }
        pageIndex += 1;
        pages.push([]);
        cursorY = PAGE_HEIGHT - TOP_MARGIN;
    };
    const drawTextLine = ({ text, font, fontSize, lineHeight, align = 'left', indent = 0, }) => {
        const width = CONTENT_WIDTH - indent;
        const x = align === 'center'
            ? Math.max(MARGIN_X, MARGIN_X + (CONTENT_WIDTH - estimateLineWidth(text, fontSize)) / 2)
            : MARGIN_X + indent;
        pages[pageIndex].push('BT');
        pages[pageIndex].push(`/${font} ${fontSize} Tf`);
        pages[pageIndex].push(`1 0 0 1 ${x.toFixed(2)} ${cursorY.toFixed(2)} Tm`);
        pages[pageIndex].push(`(${escapePdfText(text.slice(0, Math.max(1, Math.floor(width / 3)) * 3))}) Tj`);
        pages[pageIndex].push('ET');
        cursorY -= lineHeight;
    };
    const drawRule = () => {
        pages[pageIndex].push('0.78 0.82 0.9 RG');
        pages[pageIndex].push('1.2 w');
        pages[pageIndex].push(`${MARGIN_X} ${cursorY.toFixed(2)} m`);
        pages[pageIndex].push(`${(PAGE_WIDTH - MARGIN_X).toFixed(2)} ${cursorY.toFixed(2)} l`);
        pages[pageIndex].push('S');
        cursorY -= 6;
    };
    for (const block of buildRenderBlocks(paper)) {
        cursorY -= block.spacingBefore ?? 0;
        if (block.type === 'rule') {
            ensureSpace(10);
            drawRule();
            cursorY -= block.spacingAfter ?? 0;
            continue;
        }
        const indent = block.indent ?? 0;
        const lines = wrapText(block.text, block.fontSize, CONTENT_WIDTH - indent);
        const requiredHeight = lines.length * block.lineHeight + (block.spacingAfter ?? 0);
        ensureSpace(requiredHeight);
        for (const line of lines) {
            drawTextLine({
                text: line,
                font: block.font,
                fontSize: block.fontSize,
                lineHeight: block.lineHeight,
                align: block.align,
                indent,
            });
        }
        cursorY -= block.spacingAfter ?? 0;
    }
    return pages.map((commands, index, allPages) => {
        const footerY = BOTTOM_MARGIN - 18;
        commands.push('BT');
        commands.push('/F1 9 Tf');
        commands.push(`1 0 0 1 ${(PAGE_WIDTH / 2 - 24).toFixed(2)} ${footerY.toFixed(2)} Tm`);
        commands.push(`(Page ${index + 1} of ${allPages.length}) Tj`);
        commands.push('ET');
        return commands.join('\n');
    });
};
export const generateQuestionPaperPdfBase64 = (paper) => {
    const contentStreams = buildPageContentStreams(paper);
    const objects = [];
    objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
    const pageObjectNumbers = contentStreams.map((_, index) => 5 + index * 2);
    objects.push(`2 0 obj << /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${pageObjectNumbers.length} >> endobj`);
    objects.push('3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');
    objects.push('4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj');
    for (const [index, stream] of contentStreams.entries()) {
        const pageObjectNumber = 5 + index * 2;
        const contentObjectNumber = pageObjectNumber + 1;
        objects.push(`${pageObjectNumber} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >> endobj`);
        objects.push(`${contentObjectNumber} 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`);
    }
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
