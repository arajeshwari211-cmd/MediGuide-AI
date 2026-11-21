import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DICTIONARIES,
  getDateLocale,
  translateLabStatus,
  type TranslationDictionary,
} from '../i18n/index.ts';
import type { MedicalReportExplanation, SupportedLanguage } from '../types/index.ts';

function hasNonLatin1Characters(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 255) {
      return true;
    }
  }
  return false;
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [''];
}

function renderUnicodePdf(
  doc: jsPDF,
  fileName: string,
  explanation: MedicalReportExplanation,
  t: TranslationDictionary,
  language: SupportedLanguage
): void {
  const scale = 2;
  const pageWidthPx = 794; // A4 width at 96 DPI
  const pageHeightPx = 1123; // A4 height at 96 DPI
  const marginX = 52;
  const marginY = 56;
  const contentWidth = pageWidthPx - marginX * 2;
  const maxY = pageHeightPx - marginY;

  const fontStack =
    '"Noto Sans Kannada", "Noto Sans Devanagari", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';

  const pages: HTMLCanvasElement[] = [];

  const createCanvasPage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = pageWidthPx * scale;
    canvas.height = pageHeightPx * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageWidthPx, pageHeightPx);
    pages.push(canvas);
    return ctx;
  };

  let ctx = createCanvasPage();
  let y = marginY;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > maxY) {
      ctx = createCanvasPage();
      y = marginY;
    }
  };

  const drawTextBlock = (
    text: string,
    options: {
      font: string;
      color: string;
      lineHeight: number;
      x?: number;
      maxWidth?: number;
      gapAfter?: number;
    }
  ) => {
    const x = options.x ?? marginX;
    const width = options.maxWidth ?? contentWidth;
    ctx.font = options.font;
    const lines = wrapCanvasText(ctx, text, width);
    for (const line of lines) {
      ensureSpace(options.lineHeight + 4);
      ctx.font = options.font;
      ctx.fillStyle = options.color;
      ctx.fillText(line, x, y);
      y += options.lineHeight;
    }
    if (options.gapAfter) y += options.gapAfter;
  };

  // Header
  drawTextBlock(t.reports.pdf.headerTitle, {
    font: `700 22px ${fontStack}`,
    color: '#059669',
    lineHeight: 28,
    gapAfter: 4,
  });

  const dateText = new Date().toLocaleDateString(getDateLocale(language));
  drawTextBlock(
    `${t.reports.pdf.documentLabel}: ${fileName}   |   ${t.reports.pdf.generatedLabel}: ${dateText}`,
    {
      font: `400 12px ${fontStack}`,
      color: '#64748b',
      lineHeight: 18,
      gapAfter: 18,
    }
  );

  // Summary
  drawTextBlock(t.reports.pdf.summaryTitle, {
    font: `700 15px ${fontStack}`,
    color: '#0f172a',
    lineHeight: 22,
    gapAfter: 4,
  });
  drawTextBlock(explanation.summary || t.reports.pdf.noSummaryAvailable, {
    font: `400 13px ${fontStack}`,
    color: '#334155',
    lineHeight: 20,
    gapAfter: 18,
  });

  // Tests Table / Cards
  const tests = Array.isArray(explanation.tests) ? explanation.tests : [];
  if (tests.length > 0) {
    ensureSpace(44);
    drawTextBlock(t.reports.pdf.extractedTestsTitle, {
      font: `700 15px ${fontStack}`,
      color: '#0f172a',
      lineHeight: 22,
      gapAfter: 8,
    });

    const headers = t.reports.pdf.tableHeaders;
    for (const test of tests) {
      const testTitle = test.testName || t.reports.pdf.unnamedTest;
      const val = test.reportedValue || t.reports.pdf.notProvided;
      const unit = test.unit || t.reports.pdf.notProvided;
      const ref = test.referenceRange || t.reports.pdf.notProvided;
      const status = translateLabStatus(test.status || 'Not Specified', t);

      ctx.font = `400 12px ${fontStack}`;
      const explLines = test.explanation
        ? wrapCanvasText(ctx, test.explanation, contentWidth - 24)
        : [];
      const cardHeight = 46 + explLines.length * 17 + 14;
      ensureSpace(cardHeight);

      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.fillRect(marginX, y - 14, contentWidth, cardHeight);
      ctx.strokeRect(marginX, y - 14, contentWidth, cardHeight);

      ctx.font = `700 13px ${fontStack}`;
      ctx.fillStyle = '#0f172a';
      ctx.fillText(`${testTitle}  —  ${status}`, marginX + 12, y + 4);
      y += 22;

      ctx.font = `500 11.5px ${fontStack}`;
      ctx.fillStyle = '#047857';
      ctx.fillText(
        `${headers[1]}: ${val} ${unit !== t.reports.pdf.notProvided ? unit : ''}   |   ${headers[3]}: ${ref}`.trim(),
        marginX + 12,
        y
      );
      y += 18;

      ctx.font = `400 12px ${fontStack}`;
      ctx.fillStyle = '#475569';
      for (const line of explLines) {
        ctx.fillText(line, marginX + 12, y);
        y += 17;
      }
      y += 18;
    }
    y += 8;
  }

  // Questions
  const questions = Array.isArray(explanation.questionsForDoctor)
    ? explanation.questionsForDoctor
    : [];
  if (questions.length > 0) {
    ensureSpace(40);
    drawTextBlock(t.reports.pdf.questionsTitle, {
      font: `700 15px ${fontStack}`,
      color: '#0f172a',
      lineHeight: 22,
      gapAfter: 6,
    });
    for (const q of questions) {
      drawTextBlock(`• ${q}`, {
        font: `400 13px ${fontStack}`,
        color: '#334155',
        lineHeight: 19,
        gapAfter: 4,
      });
    }
    y += 12;
  }

  // Variance & Disclaimer
  ensureSpace(64);
  drawTextBlock(t.reports.pdf.noteTitle, {
    font: `700 13px ${fontStack}`,
    color: '#0f172a',
    lineHeight: 20,
    gapAfter: 4,
  });
  drawTextBlock(
    `${explanation.labVarianceNote || t.reports.defaultLabVarianceNote}\n\n${
      explanation.disclaimer || t.reports.defaultDisclaimer
    }`,
    {
      font: `400 11.5px ${fontStack}`,
      color: '#475569',
      lineHeight: 17,
    }
  );

  const pdfWidth = doc.internal.pageSize.getWidth();
  const pdfHeight = doc.internal.pageSize.getHeight();
  pages.forEach((canvas, idx) => {
    if (idx > 0) doc.addPage();
    const imgData = canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
  });
}

export function downloadReportExplanationPdf(
  fileName: string,
  explanation: MedicalReportExplanation,
  options?: {
    language?: SupportedLanguage;
    t?: TranslationDictionary;
  }
): void {
  const language: SupportedLanguage = options?.language ?? 'en';
  const t = options?.t ?? DICTIONARIES[language];

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const summaryText = explanation.summary || t.reports.pdf.noSummaryAvailable;
  const tests = Array.isArray(explanation.tests) ? explanation.tests : [];
  const questions = Array.isArray(explanation.questionsForDoctor)
    ? explanation.questionsForDoctor
    : [];
  const labVarianceNote = explanation.labVarianceNote || t.reports.defaultLabVarianceNote;
  const disclaimer = explanation.disclaimer || t.reports.defaultDisclaimer;

  const combinedText = [
    t.reports.pdf.headerTitle,
    fileName,
    summaryText,
    labVarianceNote,
    disclaimer,
    ...questions,
    ...tests.map((row) => `${row.testName} ${row.explanation} ${translateLabStatus(row.status, t)}`),
  ].join('\n');

  if (language !== 'en' || hasNonLatin1Characters(combinedText)) {
    renderUnicodePdf(
      doc,
      fileName,
      {
        summary: summaryText,
        tests,
        questionsForDoctor: questions,
        labVarianceNote,
        disclaimer,
      },
      t,
      language
    );
    const safeBase = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(`MediGuide_Summary_${safeBase || 'Report'}.pdf`);
    return;
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 48;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(5, 150, 105);
  doc.text(t.reports.pdf.headerTitle, 40, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${t.reports.pdf.documentLabel}: ${fileName}   |   ${t.reports.pdf.generatedLabel}: ${new Date().toLocaleDateString(
      getDateLocale(language)
    )}`,
    40,
    y
  );
  y += 22;

  // Summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(t.reports.pdf.summaryTitle, 40, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  const summaryLines = doc.splitTextToSize(summaryText, pageWidth - 80);
  doc.text(summaryLines, 40, y);
  y += summaryLines.length * 14 + 16;

  // Lab Table
  if (tests.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(t.reports.pdf.extractedTestsTitle, 40, y);
    y += 10;

    autoTable(doc, {
      startY: y,
      head: [t.reports.pdf.tableHeaders],
      body: tests.map((row) => [
        row.testName || t.reports.pdf.unnamedTest,
        row.reportedValue || t.reports.pdf.notProvided,
        row.unit || t.reports.pdf.notProvided,
        row.referenceRange || t.reports.pdf.notProvided,
        translateLabStatus(row.status || 'Not Specified', t),
        row.explanation || '',
      ]),
      styles: {
        fontSize: 8.5,
        cellPadding: 6,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [5, 150, 105],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 85 },
        1: { cellWidth: 50 },
        2: { cellWidth: 45 },
        3: { cellWidth: 75 },
        4: { cellWidth: 65 },
        5: { cellWidth: 'auto' },
      },
      margin: { left: 40, right: 40 },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
    y = (finalY ?? y + 60) + 22;
  }

  // Questions for Doctor
  if (questions.length > 0) {
    if (y > 680) {
      doc.addPage();
      y = 48;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(t.reports.pdf.questionsTitle, 40, y);
    y += 16;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    for (const q of questions) {
      const lines = doc.splitTextToSize(`• ${q}`, pageWidth - 80);
      if (y + lines.length * 14 > 770) {
        doc.addPage();
        y = 48;
      }
      doc.text(lines, 40, y);
      y += lines.length * 14 + 4;
    }
    y += 10;
  }

  // Variance & Disclaimer
  if (y > 700) {
    doc.addPage();
    y = 48;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(t.reports.pdf.noteTitle, 40, y);
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  const noteLines = doc.splitTextToSize(`${labVarianceNote}\n\n${disclaimer}`, pageWidth - 80);
  doc.text(noteLines, 40, y);

  const safeBase = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`MediGuide_Summary_${safeBase || 'Report'}.pdf`);
}
