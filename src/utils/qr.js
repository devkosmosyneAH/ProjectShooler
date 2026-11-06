import QRCode from "qrcode";
import { jsPDF } from "jspdf";

const QR_SIZE = 1200;
const QUIET_ZONE = 4;
const FINDER_ORIGINS = (size) => [
  [0, 0],
  [size - 7, 0],
  [0, size - 7],
];
const PIXEL_DINOSAUR = [
  "......#####.",
  "......#...##",
  ".......####.",
  "...########.",
  ".#########..",
  "##.#######...",
  "...########..",
  "....######...",
  "...#########.",
  "..##########.",
  ".###.####.##..",
  "##...##...##..",
  ".....##...##..",
  ".....##.......",
];

function fillRoundedRect(context, x, y, width, height, radius) {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.lineTo(x + width - corner, y);
  context.quadraticCurveTo(x + width, y, x + width, y + corner);
  context.lineTo(x + width, y + height - corner);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - corner,
    y + height,
  );
  context.lineTo(x + corner, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - corner);
  context.lineTo(x, y + corner);
  context.quadraticCurveTo(x, y, x + corner, y);
  context.closePath();
  context.fill();
}

function isFinderModule(row, column, size) {
  return FINDER_ORIGINS(size).some(
    ([left, top]) =>
      column >= left &&
      column < left + 7 &&
      row >= top &&
      row < top + 7,
  );
}

function drawFinder(context, left, top, cellSize) {
  const x = (left + QUIET_ZONE) * cellSize;
  const y = (top + QUIET_ZONE) * cellSize;
  context.fillStyle = "#000000";
  fillRoundedRect(context, x, y, cellSize * 7, cellSize * 7, cellSize * 1.4);
  context.fillStyle = "#ffffff";
  fillRoundedRect(
    context,
    x + cellSize,
    y + cellSize,
    cellSize * 5,
    cellSize * 5,
    cellSize,
  );
  context.fillStyle = "#000000";
  fillRoundedRect(
    context,
    x + cellSize * 2,
    y + cellSize * 2,
    cellSize * 3,
    cellSize * 3,
    cellSize * 0.8,
  );
}

function drawCenterMark(context, size, cellSize) {
  const markSize = 12;
  const markScale = cellSize * 0.66;
  const markX = (QUIET_ZONE + (size - markSize) / 2) * cellSize;
  const markY = (QUIET_ZONE + (size - markSize) / 2) * cellSize;
  const padding = (markSize * cellSize - markSize * markScale) / 2;

  context.fillStyle = "#ffffff";
  fillRoundedRect(
    context,
    markX,
    markY,
    markSize * cellSize,
    markSize * cellSize,
    cellSize * 1.5,
  );
  context.fillStyle = "#000000";
  PIXEL_DINOSAUR.forEach((row, rowIndex) => {
    [...row].forEach((pixel, columnIndex) => {
      if (pixel === "#") {
        context.fillRect(
          markX + padding + columnIndex * markScale,
          markY + padding + rowIndex * markScale,
          markScale,
          markScale,
        );
      }
    });
  });
}

export async function makeQrDataUrl(url) {
  if (!url) throw new Error("Configura primero la URL pública del proyecto.");
  const qr = QRCode.create(url, {
    errorCorrectionLevel: "H",
  });
  const canvas = document.createElement("canvas");
  canvas.width = QR_SIZE;
  canvas.height = QR_SIZE;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("El navegador no pudo preparar la imagen del código QR.");

  const cellSize = QR_SIZE / (qr.modules.size + QUIET_ZONE * 2);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, QR_SIZE, QR_SIZE);
  context.fillStyle = "#000000";
  for (let row = 0; row < qr.modules.size; row += 1) {
    for (let column = 0; column < qr.modules.size; column += 1) {
      if (
        qr.modules.get(row, column) &&
        !isFinderModule(row, column, qr.modules.size)
      ) {
        context.beginPath();
        context.arc(
          (column + QUIET_ZONE + 0.5) * cellSize,
          (row + QUIET_ZONE + 0.5) * cellSize,
          cellSize * 0.36,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    }
  }
  FINDER_ORIGINS(qr.modules.size).forEach(([left, top]) =>
    drawFinder(context, left, top, cellSize),
  );
  drawCenterMark(context, qr.modules.size, cellSize);
  return canvas.toDataURL("image/png");
}

export async function downloadQrPdf(url, caption = "") {
  const image = await makeQrDataUrl(url);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("Proyecto escolar", 105, 34, { align: "center" });
  pdf.addImage(image, "PNG", 50, 48, 110, 110);
  if (caption.trim()) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    pdf.text(pdf.splitTextToSize(caption.trim(), 150), 105, 174, {
      align: "center",
    });
  }
  pdf.setFontSize(9);
  pdf.text(url, 105, 270, { align: "center", maxWidth: 170 });
  pdf.save("codigo-qr-proyecto.pdf");
}
