import { beforeEach, describe, expect, test, vi } from 'vitest';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { downloadQrPdf, makeQrDataUrl } from './qr';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn() },
}));
vi.mock('jspdf', () => ({
  jsPDF: vi.fn(() => ({
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    text: vi.fn(),
    addImage: vi.fn(),
    splitTextToSize: vi.fn((text) => [text]),
    save: vi.fn(),
  })),
}));

describe('QR generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    QRCode.toDataURL.mockResolvedValue('data:image/png;base64,qr');
  });

  test('creates a high-resolution QR with high error correction and quiet margin', async () => {
    const result = await makeQrDataUrl('https://school.github.io/science/');

    expect(result).toBe('data:image/png;base64,qr');
    expect(QRCode.toDataURL).toHaveBeenCalledWith('https://school.github.io/science/', expect.objectContaining({
      errorCorrectionLevel: 'H',
      margin: 4,
      width: 1200,
    }));
  });

  test('exports a print-ready PDF containing the QR image and optional caption', async () => {
    await downloadQrPdf('https://school.github.io/science/', 'Escanea el proyecto');
    expect(jsPDF).toHaveBeenCalled();
    expect(jsPDF.mock.results[0].value.addImage).toHaveBeenCalledWith('data:image/png;base64,qr', 'PNG', 50, 48, 110, 110);
    expect(jsPDF.mock.results[0].value.save).toHaveBeenCalledWith('codigo-qr-proyecto.pdf');
  });

  test('requires a public URL', async () => {
    await expect(makeQrDataUrl('')).rejects.toThrow(/URL pública/i);
  });
});
