import { sanitizePdfRenderableText } from './questionPaperSanitizer.js';
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 44;
const TOP_MARGIN = 44;
const BOTTOM_MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const FOOTER_HEIGHT = 24;
const MARKS_GUTTER = 52;
const escapePdfText = (value) => value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r?\n/g, ' ');
const estimateLineWidth = (text, fontSize) => text.length * fontSize * 0.5;
const wrapText = (value, fontSize, width) => {
    const text = sanitizePdfRenderableText(value);
    if (!text) {
        return [''];
    }
    const maxChars = Math.max(14, Math.floor(width / Math.max(fontSize * 0.5, 1)));
    const words = text.split(' ');
    const lines = [];
    let current = '';
    const push = () => {
        if (current.trim()) {
            lines.push(current.trim());
            current = '';
        }
    };
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= maxChars) {
            current = candidate;
            continue;
        }
        if (!current) {
            lines.push(word);
            continue;
        }
        push();
        current = word;
    }
    push();
    return lines.length ? lines : [''];
};
const createPage = () => ({
    commands: [],
    cursorY: PAGE_HEIGHT - TOP_MARGIN,
});
const drawText = ({ page, text, x, y, font, fontSize, }) => {
    page.commands.push('BT');
    page.commands.push(`/${font} ${fontSize} Tf`);
    page.commands.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`);
    page.commands.push(`(${escapePdfText(sanitizePdfRenderableText(text))}) Tj`);
    page.commands.push('ET');
};
const drawLine = (page, x1, y1, x2, y2, lineWidth = 1) => {
    page.commands.push('0 0 0 RG');
    page.commands.push(`${lineWidth} w`);
    page.commands.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m`);
    page.commands.push(`${x2.toFixed(2)} ${y2.toFixed(2)} l`);
    page.commands.push('S');
};
const drawRect = (page, x, y, width, height, lineWidth = 1) => {
    page.commands.push('0 0 0 RG');
    page.commands.push(`${lineWidth} w`);
    page.commands.push(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re`);
    page.commands.push('S');
};
const drawWrappedText = ({ page, text, x, y, width, font, fontSize, lineHeight, }) => {
    const lines = wrapText(text, fontSize, width);
    for (const [index, line] of lines.entries()) {
        drawText({
            page,
            text: line,
            x,
            y: y - index * lineHeight,
            font,
            fontSize,
        });
    }
    return lines.length * lineHeight;
};
const sectionDisplayTitle = (section) => {
    const sectionMarks = section.totalMarks ?? section.questions * section.marksPerQuestion;
    return `${section.displayName || section.name} - ${section.questionTypeDisplay || section.questionType} (${section.marksPerQuestion} x ${section.questions} = ${sectionMarks} Marks)`;
};
const getHeaderSessionLabel = (paper) => sanitizePdfRenderableText(paper.sessionLabel || String(new Date().getFullYear()));
const getHeaderBoardName = (paper) => sanitizePdfRenderableText(paper.headerBoardName || paper.examBoard);
const getHeaderExamTitle = (paper) => sanitizePdfRenderableText(paper.examinationTitle || `${paper.educationLevel} Examination`);
const getSubjectCode = (paper) => sanitizePdfRenderableText(paper.subjectCode || '__________');
const getGeneralInstructions = (paper) => paper.generalInstructions?.length
    ? paper.generalInstructions.map(sanitizePdfRenderableText)
    : ['All questions are compulsory.', 'Write answers clearly.', 'Marks are indicated against each question.'];
const buildQuestionBlockLines = (question) => {
    const baseLine = `${question.questionNumber}. ${sanitizePdfRenderableText(question.text)}`;
    const optionLines = question.options?.map((option, index) => `(${String.fromCharCode(65 + index)}) ${sanitizePdfRenderableText(option)}`) ?? [];
    const subPartLines = question.subParts?.map((part, index) => `(${String.fromCharCode(97 + index)}) ${sanitizePdfRenderableText(part)}`) ?? [];
    return {
        baseLine,
        optionLines,
        subPartLines,
    };
};
const estimateQuestionBlockHeight = (question) => {
    const { baseLine, optionLines, subPartLines } = buildQuestionBlockLines(question);
    const baseLines = wrapText(baseLine, 11, CONTENT_WIDTH - MARKS_GUTTER);
    const optionHeight = optionLines.reduce((sum, option) => sum + wrapText(option, 10, CONTENT_WIDTH - 24).length * 14, 0);
    const subPartHeight = subPartLines.reduce((sum, part) => sum + wrapText(part, 10, CONTENT_WIDTH - 24).length * 14, 0);
    return baseLines.length * 15 + optionHeight + subPartHeight + 12;
};
const ensureSpace = (pages, requiredHeight) => {
    let page = pages[pages.length - 1];
    if (page.cursorY - requiredHeight < BOTTOM_MARGIN + FOOTER_HEIGHT) {
        page = createPage();
        pages.push(page);
    }
    return page;
};
const renderHeader = (page, paper) => {
    const boxHeight = 150;
    const topY = page.cursorY;
    const bottomY = topY - boxHeight;
    drawRect(page, MARGIN_X, bottomY, CONTENT_WIDTH, boxHeight, 1.2);
    drawLine(page, MARGIN_X, topY - 48, MARGIN_X + CONTENT_WIDTH, topY - 48, 1);
    drawLine(page, MARGIN_X, topY - 92, MARGIN_X + CONTENT_WIDTH, topY - 92, 1);
    drawText({ page, text: getHeaderBoardName(paper), x: MARGIN_X + CONTENT_WIDTH / 2 - estimateLineWidth(getHeaderBoardName(paper), 15) / 2, y: topY - 20, font: 'F2', fontSize: 15 });
    drawText({ page, text: getHeaderExamTitle(paper), x: MARGIN_X + CONTENT_WIDTH / 2 - estimateLineWidth(getHeaderExamTitle(paper), 12) / 2, y: topY - 36, font: 'F2', fontSize: 12 });
    drawText({ page, text: getHeaderSessionLabel(paper), x: MARGIN_X + CONTENT_WIDTH / 2 - estimateLineWidth(getHeaderSessionLabel(paper), 11) / 2, y: topY - 52, font: 'F2', fontSize: 11 });
    drawText({ page, text: `Subject: ${sanitizePdfRenderableText(paper.subject)}`, x: MARGIN_X + 10, y: topY - 68, font: 'F1', fontSize: 11 });
    drawText({ page, text: `Code: ${getSubjectCode(paper)}`, x: MARGIN_X + CONTENT_WIDTH / 2 + 8, y: topY - 68, font: 'F1', fontSize: 11 });
    drawText({ page, text: `Time Allowed: ${sanitizePdfRenderableText(paper.format.duration)}`, x: MARGIN_X + 10, y: topY - 84, font: 'F1', fontSize: 11 });
    drawText({ page, text: `Maximum Marks: ${paper.format.totalMarks}`, x: MARGIN_X + CONTENT_WIDTH / 2 + 8, y: topY - 84, font: 'F1', fontSize: 11 });
    drawText({ page, text: 'Roll No: ________________', x: MARGIN_X + 10, y: topY - 108, font: 'F1', fontSize: 10 });
    drawText({ page, text: 'Date: _______________', x: MARGIN_X + CONTENT_WIDTH / 2 + 8, y: topY - 108, font: 'F1', fontSize: 10 });
    drawText({ page, text: "Candidate's Name: _________________________________", x: MARGIN_X + 10, y: topY - 124, font: 'F1', fontSize: 10 });
    drawText({ page, text: 'Centre No: _______________', x: MARGIN_X + 10, y: topY - 140, font: 'F1', fontSize: 10 });
    drawText({ page, text: "Invigilator's Sign: _______", x: MARGIN_X + CONTENT_WIDTH / 2 + 8, y: topY - 140, font: 'F1', fontSize: 10 });
    page.cursorY = bottomY - 12;
};
const renderGeneralInstructions = (page, paper) => {
    const instructions = getGeneralInstructions(paper);
    drawText({ page, text: 'General Instructions', x: MARGIN_X, y: page.cursorY, font: 'F2', fontSize: 12 });
    page.cursorY -= 18;
    for (const [index, instruction] of instructions.entries()) {
        const height = drawWrappedText({
            page,
            text: `${index + 1}. ${instruction}`,
            x: MARGIN_X + 8,
            y: page.cursorY,
            width: CONTENT_WIDTH - 8,
            font: 'F1',
            fontSize: 10,
            lineHeight: 13,
        });
        page.cursorY -= height + 4;
    }
    page.cursorY -= 4;
};
const renderSectionHeader = (page, section) => {
    drawLine(page, MARGIN_X, page.cursorY + 4, MARGIN_X + CONTENT_WIDTH, page.cursorY + 4, 1);
    drawText({
        page,
        text: sectionDisplayTitle(section),
        x: MARGIN_X,
        y: page.cursorY - 10,
        font: 'F2',
        fontSize: 11,
    });
    page.cursorY -= 26;
    const instructionHeight = drawWrappedText({
        page,
        text: sanitizePdfRenderableText(section.instructions),
        x: MARGIN_X,
        y: page.cursorY,
        width: CONTENT_WIDTH,
        font: 'F1',
        fontSize: 10,
        lineHeight: 13,
    });
    page.cursorY -= instructionHeight + 8;
};
const renderQuestion = (page, question) => {
    const { baseLine, optionLines, subPartLines } = buildQuestionBlockLines(question);
    const baseLines = wrapText(baseLine, 11, CONTENT_WIDTH - MARKS_GUTTER);
    drawText({ page, text: `[${question.marks}]`, x: MARGIN_X + CONTENT_WIDTH - 26, y: page.cursorY, font: 'F2', fontSize: 10 });
    for (const [index, line] of baseLines.entries()) {
        drawText({
            page,
            text: line,
            x: MARGIN_X,
            y: page.cursorY - index * 15,
            font: 'F1',
            fontSize: 11,
        });
    }
    page.cursorY -= baseLines.length * 15;
    for (const optionLine of optionLines) {
        const height = drawWrappedText({
            page,
            text: optionLine,
            x: MARGIN_X + 18,
            y: page.cursorY,
            width: CONTENT_WIDTH - 18,
            font: 'F1',
            fontSize: 10,
            lineHeight: 13,
        });
        page.cursorY -= height;
    }
    for (const partLine of subPartLines) {
        const height = drawWrappedText({
            page,
            text: partLine,
            x: MARGIN_X + 18,
            y: page.cursorY,
            width: CONTENT_WIDTH - 18,
            font: 'F1',
            fontSize: 10,
            lineHeight: 13,
        });
        page.cursorY -= height;
    }
    page.cursorY -= 8;
};
const renderFooter = (page, paper, pageNumber, totalPages) => {
    const footerY = BOTTOM_MARGIN - 8;
    const left = `${getSubjectCode(paper)} - ${sanitizePdfRenderableText(paper.examBoard)} ${getHeaderSessionLabel(paper)}`;
    const middle = `Page ${pageNumber} of ${totalPages}`;
    const right = '[DO NOT WRITE IN THIS SPACE]';
    drawText({ page, text: left, x: MARGIN_X, y: footerY, font: 'F1', fontSize: 9 });
    drawText({
        page,
        text: middle,
        x: PAGE_WIDTH / 2 - estimateLineWidth(middle, 9) / 2,
        y: footerY,
        font: 'F1',
        fontSize: 9,
    });
    drawText({
        page,
        text: right,
        x: PAGE_WIDTH - MARGIN_X - estimateLineWidth(right, 9),
        y: footerY,
        font: 'F1',
        fontSize: 9,
    });
};
const buildPageContentStreams = (paper) => {
    const pages = [createPage()];
    let page = pages[0];
    renderHeader(page, paper);
    renderGeneralInstructions(page, paper);
    for (const section of paper.format.sections) {
        const sectionQuestions = paper.questions.filter((question) => question.sectionName === section.name);
        const firstQuestionHeight = sectionQuestions[0] ? estimateQuestionBlockHeight(sectionQuestions[0]) : 0;
        page = ensureSpace(pages, 54 + firstQuestionHeight);
        renderSectionHeader(page, section);
        for (const question of sectionQuestions) {
            page = ensureSpace(pages, estimateQuestionBlockHeight(question));
            renderQuestion(page, question);
        }
    }
    pages.forEach((currentPage, index) => {
        renderFooter(currentPage, paper, index + 1, pages.length);
    });
    return pages.map((pageItem) => pageItem.commands.join('\n'));
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
