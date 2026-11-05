import { createWorker } from "tesseract.js";

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const OCR_REVIEW_CONFIDENCE = 75;

const imageExtensions = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

export function validateImageFile(file) {
  if (!file || typeof file.name !== "string")
    return "Selecciona un archivo de imagen válido.";
  const extension = file.name.match(/\.[^.]+$/)?.[0].toLowerCase();
  const expectedType = imageExtensions.get(extension);
  if (!expectedType || (file.type && file.type !== expectedType)) {
    return `${file.name}: solo se aceptan imágenes JPG, PNG o WEBP válidas.`;
  }
  if (!Number.isFinite(file.size) || file.size <= 0)
    return `${file.name}: el archivo está vacío.`;
  if (file.size > MAX_IMAGE_SIZE)
    return `${file.name}: supera el límite de 10 MB.`;
  return "";
}

export function validateImageFiles(files) {
  return Array.from(files || [])
    .map(validateImageFile)
    .filter(Boolean);
}

function classifyOcrLines(text) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dates = lines.filter((line) =>
    /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/.test(
      line,
    ),
  );
  const data = lines.filter((line) => /\d/.test(line) && !dates.includes(line));
  const titles = lines.filter(
    (line) =>
      line.length <= 100 &&
      !/[.!?]$/.test(line) &&
      !dates.includes(line) &&
      !data.includes(line),
  );
  const paragraphs = lines.filter(
    (line) =>
      !titles.includes(line) && !dates.includes(line) && !data.includes(line),
  );
  return { titles, paragraphs, dates, data };
}

export async function analyzeImageFiles(
  files,
  { onProgress = () => {}, workerFactory = createWorker } = {},
) {
  const images = Array.from(files || []);
  const errors = validateImageFiles(images);
  if (errors.length) throw new Error(errors.join(" "));
  if (!images.length) return [];

  let worker;
  try {
    worker = await workerFactory("spa+eng", 1, {
      logger: ({ status, progress }) => onProgress({ status, progress }),
    });
    const results = [];
    for (let index = 0; index < images.length; index += 1) {
      onProgress({ current: index + 1, total: images.length, phase: "ocr" });
      const { data } = await worker.recognize(images[index]);
      const ocrText = String(data.text || "").trim();
      const confidence = Number.isFinite(data.confidence)
        ? data.confidence
        : null;
      results.push({
        ocrText,
        ocrConfidence: confidence,
        ocrReviewRequired:
          !ocrText || confidence === null || confidence < OCR_REVIEW_CONFIDENCE,
        ocrClassification: classifyOcrLines(ocrText),
        visualReviewRequired: true,
      });
      onProgress({
        current: index + 1,
        total: images.length,
        phase: "complete",
      });
    }
    return results;
  } finally {
    if (worker) await worker.terminate();
  }
}

export function isValidGitHubRawBaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    return (
      url.protocol === "https:" &&
      url.hostname === "raw.githubusercontent.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      segments.length >= 3 &&
      segments.every((segment) => segment !== "." && segment !== "..")
    );
  } catch {
    return false;
  }
}

export function normalizeGitHubRawBaseUrl(value) {
  if (!isValidGitHubRawBaseUrl(value)) {
    throw new Error(
      "La URL debe ser una ruta HTTPS válida de raw.githubusercontent.com hacia una carpeta pública.",
    );
  }
  return `${value.trim().replace(/\/+$/, "")}/`;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      ![
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be",
        "www.youtu.be",
      ].includes(url.hostname)
    )
      return null;

    let videoId = "";
    if (url.hostname.endsWith("youtu.be")) {
      videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v") || "";
    } else {
      const match = url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)\/?$/);
      videoId = match?.[1] || "";
    }
    if (!YOUTUBE_ID.test(videoId)) return null;
    return {
      url: url.href,
      videoId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
    };
  } catch {
    return null;
  }
}

export function validateYouTubeUrl(value) {
  return parseYouTubeUrl(value)
    ? ""
    : "Introduce una URL HTTPS válida de un video de YouTube (watch, youtu.be o Shorts).";
}

export function resolveRawResourceUrl(baseUrl, path) {
  if (
    !isValidGitHubRawBaseUrl(baseUrl) ||
    typeof path !== "string" ||
    !path.trim()
  ) {
    throw new Error(
      "No se puede resolver el recurso de GitHub Raw con esta configuración.",
    );
  }
  if (
    !/^[A-Za-z0-9._/-]+$/.test(path) ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error(
      "La ruta del recurso debe ser relativa y no puede salir de la carpeta configurada.",
    );
  }
  return new URL(
    path.split("/").map(encodeURIComponent).join("/"),
    normalizeGitHubRawBaseUrl(baseUrl),
  ).href;
}
