import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PdfProcessingCancelledError, processPdf } from './pdfProcessor';
import { createWorker } from 'tesseract.js';
import { getDocument } from 'pdfjs-dist';

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
}));
vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(),
}));

function makePage(text) {
  return {
    getTextContent: vi.fn().mockResolvedValue({
      items: text ? [{ str: text, transform: [1, 0, 0, 1, 0, 800], width: text.length * 5 }] : [],
    }),
    getViewport: vi.fn(({ scale }) => ({ width: 600 * scale, height: 800 * scale })),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    cleanup: vi.fn(),
  };
}

function setPdfPages(pages) {
  const document = {
    numPages: pages.length,
    getPage: vi.fn(async (number) => pages[number - 1]),
    destroy: vi.fn(),
  };
  getDocument.mockReturnValue({ promise: Promise.resolve(document) });
  return document;
}

function pdfFile(name = 'project.pdf') {
  return {
    name,
    type: 'application/pdf',
    size: 8,
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  };
}

describe('browser PDF extraction', () => {
  let ocrWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}));
    ocrWorker = {
      recognize: vi.fn().mockResolvedValue({ data: { text: 'OCR recognized text' } }),
      terminate: vi.fn(),
    };
    createWorker.mockResolvedValue(ocrWorker);
  });

  test('extracts selectable text from a multipage PDF without starting OCR', async () => {
    const pages = [makePage('Selectable text from the first PDF page.'), makePage('Selectable text from the second PDF page.')];
    const document = setPdfPages(pages);
    const progress = vi.fn();

    const result = await processPdf(pdfFile(), { onProgress: progress });

    expect(result.pages).toHaveLength(2);
    expect(result.pageCount).toBe(2);
    expect(result.ocrPages).toEqual([]);
    expect(createWorker).not.toHaveBeenCalled();
    expect(pages[1].cleanup).toHaveBeenCalled();
    expect(document.destroy).toHaveBeenCalled();
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ page: 2, phase: 'complete' }));
  });

  test('uses OCR only for scanned pages in a mixed PDF', async () => {
    const pages = [
      makePage('This selectable page already contains enough searchable text.'),
      makePage(''),
      makePage('This third page also has readable selectable text.'),
    ];
    setPdfPages(pages);

    const result = await processPdf(pdfFile());

    expect(result.ocrPages).toEqual([2]);
    expect(result.pages.map(({ ocrUsed }) => ocrUsed)).toEqual([false, true, false]);
    expect(result.pages[1].text).toBe('OCR recognized text');
    expect(createWorker).toHaveBeenCalledWith('spa+eng', 1, expect.any(Object));
    expect(ocrWorker.recognize).toHaveBeenCalledTimes(1);
    expect(ocrWorker.terminate).toHaveBeenCalled();
  });

  test('rejects empty and damaged PDFs with clear errors', async () => {
    await expect(processPdf(new File([], 'empty.pdf', { type: 'application/pdf' }))).rejects.toThrow(/válido y no vacío/i);
    getDocument.mockReturnValue({ promise: Promise.reject(new Error('Invalid PDF structure')) });
    await expect(processPdf(pdfFile())).rejects.toThrow(/Invalid PDF structure/i);
  });

  test('supports cancellation between pages and tears down resources', async () => {
    const pages = [makePage('First page has sufficient selectable text for extraction.'), makePage('Second page has sufficient selectable text too.')];
    const document = setPdfPages(pages);
    let cancelled = false;
    await expect(processPdf(pdfFile(), {
      onProgress: ({ phase, page }) => { if (phase === 'complete' && page === 1) cancelled = true; },
      isCancelled: () => cancelled,
    })).rejects.toBeInstanceOf(PdfProcessingCancelledError);
    expect(document.destroy).toHaveBeenCalled();
    expect(pages[1].getTextContent).not.toHaveBeenCalled();
  });
});
