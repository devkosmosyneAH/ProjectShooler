import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker } from "tesseract.js";
import { MAX_PDF_SIZE } from "./projectData";

GlobalWorkerOptions.workerSrc = workerUrl;

export class PdfProcessingCancelledError extends Error {
  constructor() {
    super("El procesamiento se canceló.");
    this.name = "PdfProcessingCancelledError";
  }
}

function pageText(items) {
  const rows = [];
  for (const item of items) {
    if (!item.str?.trim()) continue;
    const y = item.transform?.[5] ?? 0;
    let row = rows.find((candidate) => Math.abs(candidate.y - y) < 3);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({
      x: item.transform?.[4] ?? 0,
      width: item.width ?? 0,
      text: item.str,
    });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) =>
      row.items
        .sort((a, b) => a.x - b.x)
        .reduce((cells, item, index, items) => {
          const previous = items[index - 1];
          const separator =
            previous && item.x - previous.x - previous.width > 28 ? "\t" : " ";
          cells.push(`${index === 0 ? "" : separator}${item.text.trim()}`);
          return cells;
        }, [])
        .join(""),
    )
    .filter(Boolean)
    .join("\n");
}

export async function processPdf(
  file,
  { onProgress = () => {}, isCancelled = () => false } = {},
) {
  if (
    !file ||
    !(
      file.type === "application/pdf" ||
      file.name?.toLowerCase().endsWith(".pdf")
    ) ||
    file.size === 0
  ) {
    throw new Error("Selecciona un documento PDF válido y no vacío.");
  }
  if (file.size > MAX_PDF_SIZE)
    throw new Error("El PDF supera el límite de 50 MB.");

  let loadingTask;
  let document;
  let ocrWorker;
  const pages = [];
  const ocrPages = [];
  let activeOcrPage = 0;
  try {
    loadingTask = getDocument({ data: await file.arrayBuffer() });
    document = await loadingTask.promise;
    if (!document.numPages)
      throw new Error("El PDF no contiene páginas para procesar.");
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      if (isCancelled()) throw new PdfProcessingCancelledError();
      onProgress({ page: pageNumber, total: document.numPages, phase: "text" });
      const page = await document.getPage(pageNumber);
      try {
        const text = pageText((await page.getTextContent()).items);
        if (isCancelled()) throw new PdfProcessingCancelledError();
        let output = text;

        if (text.replace(/\s/g, "").length < 30) {
          if (!ocrWorker) {
            activeOcrPage = pageNumber;
            onProgress({
              page: pageNumber,
              total: document.numPages,
              phase: "ocr",
            });
            ocrWorker = await createWorker("spa+eng", 1, {
              logger: ({ status, progress }) =>
                onProgress({
                  page: activeOcrPage,
                  total: document.numPages,
                  phase: "ocr",
                  status,
                  progress,
                }),
            });
          }
          if (isCancelled()) throw new PdfProcessingCancelledError();
          activeOcrPage = pageNumber;
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(
            1.6,
            2200 / Math.max(baseViewport.width, baseViewport.height),
          );
          const viewport = page.getViewport({ scale });
          const canvas = globalThis.document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          try {
            const context = canvas.getContext("2d", {
              willReadFrequently: true,
            });
            if (!context)
              throw new Error(
                `No se pudo preparar la página ${pageNumber} para OCR.`,
              );
            await page.render({ canvasContext: context, viewport }).promise;
            const result = await ocrWorker.recognize(canvas);
            output = result.data.text.trim();
          } finally {
            canvas.width = 0;
            canvas.height = 0;
          }
          ocrPages.push(pageNumber);
        }
        if (isCancelled()) throw new PdfProcessingCancelledError();
        pages.push({
          pageNumber,
          text: output,
          ocrUsed: ocrPages.includes(pageNumber),
        });
        onProgress({
          page: pageNumber,
          total: document.numPages,
          phase: "complete",
        });
      } finally {
        page.cleanup();
      }
    }
    return { pages, pageCount: document.numPages, ocrPages };
  } catch (error) {
    if (error?.name === "PasswordException")
      throw new Error(
        "El PDF está protegido con contraseña y no se puede procesar.",
      );
    if (error instanceof PdfProcessingCancelledError) throw error;
    throw new Error(
      `No se pudo procesar el PDF: ${error.message || "archivo dañado o incompatible"}`,
    );
  } finally {
    if (ocrWorker) await ocrWorker.terminate();
    if (loadingTask) await loadingTask.destroy();
  }
}
