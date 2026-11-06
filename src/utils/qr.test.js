import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { downloadQrPdf, makeQrDataUrl } from "./qr";

vi.mock("qrcode", () => ({
  default: {
    create: vi.fn(),
  },
}));
vi.mock("jspdf", () => ({
  jsPDF: vi.fn(function MockJsPdf() {
    return {
      setFont: vi.fn(),
      setFontSize: vi.fn(),
      text: vi.fn(),
      addImage: vi.fn(),
      splitTextToSize: vi.fn((text) => [text]),
      save: vi.fn(),
    };
  }),
}));

describe("QR generation", () => {
  let canvasContext;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    canvasContext = {
      arc: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,qr",
    );
    QRCode.create.mockReturnValue({
      modules: {
        size: 21,
        get: vi.fn(() => true),
      },
    });
  });

  test("draws a high-resolution dotted QR with rounded finders and center mark", async () => {
    const result = await makeQrDataUrl("https://school.github.io/science/");

    expect(result).toBe("data:image/png;base64,qr");
    expect(QRCode.create).toHaveBeenCalledWith(
      "https://school.github.io/science/",
      expect.objectContaining({
        errorCorrectionLevel: "H",
      }),
    );
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith(
      "image/png",
    );
    expect(canvasContext.arc).toHaveBeenCalled();
    expect(canvasContext.quadraticCurveTo).toHaveBeenCalled();
    expect(canvasContext.fillRect).toHaveBeenCalled();
  });

  test("exports a print-ready PDF containing the QR image and optional caption", async () => {
    await downloadQrPdf(
      "https://school.github.io/science/",
      "Escanea el proyecto",
    );
    expect(jsPDF).toHaveBeenCalled();
    expect(jsPDF.mock.results[0].value.addImage).toHaveBeenCalledWith(
      "data:image/png;base64,qr",
      "PNG",
      50,
      48,
      110,
      110,
    );
    expect(jsPDF.mock.results[0].value.save).toHaveBeenCalledWith(
      "codigo-qr-proyecto.pdf",
    );
  });

  test("requires a public URL", async () => {
    await expect(makeQrDataUrl("")).rejects.toThrow(/URL pública/i);
  });
});
