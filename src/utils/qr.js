import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

export async function makeQrDataUrl(url) {
  if (!url) throw new Error('Configura primero la URL pública del proyecto.');
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 4,
    width: 1200,
    color: { dark: '#172238', light: '#ffffff' },
  });
}

export async function downloadQrPdf(url, caption = '') {
  const image = await makeQrDataUrl(url);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('Proyecto escolar', 105, 34, { align: 'center' });
  pdf.addImage(image, 'PNG', 50, 48, 110, 110);
  if (caption.trim()) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(12);
    pdf.text(pdf.splitTextToSize(caption.trim(), 150), 105, 174, { align: 'center' });
  }
  pdf.setFontSize(9);
  pdf.text(url, 105, 270, { align: 'center', maxWidth: 170 });
  pdf.save('codigo-qr-proyecto.pdf');
}
