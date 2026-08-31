import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

// Print-ready, single-page PDF for one lot's QR code — used by both the
// Roaster and Coffee Shop cabinets ("Скачать QR (PDF)") so a lot/stand code
// can be printed and put on a shelf or table tent. Client-only: jsPDF's
// .save() triggers a browser download, same as the existing "Скопировать
// ссылку / QR" PNG preview in app/dashboard/roaster/page.tsx.
export async function downloadLotQrPdf({
  lotId,
  lotName,
  roasterName,
  url,
}: {
  lotId: string;
  lotName: string;
  roasterName: string;
  url: string;
}): Promise<void> {
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 600,
    margin: 1,
    color: { dark: '#1a1a1a', light: '#ffffff' },
  });

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Coffee Passport', pageWidth / 2, 25, { align: 'center' });

  doc.setFontSize(20);
  doc.text(lotName, pageWidth / 2, 38, { align: 'center', maxWidth: pageWidth - 40 });

  doc.setFontSize(12);
  doc.text(roasterName, pageWidth / 2, 47, { align: 'center' });

  const qrSize = 110;
  const qrX = (pageWidth - qrSize) / 2;
  doc.addImage(qrDataUrl, 'PNG', qrX, 60, qrSize, qrSize);

  doc.setFontSize(10);
  doc.text('Отсканируйте, чтобы попробовать этот кофе вслепую', pageWidth / 2, 182, {
    align: 'center',
  });

  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text(lotId, pageWidth / 2, 190, { align: 'center' });

  doc.save(`${lotId}-qr.pdf`);
}
