// «Consulte su boleta» (SOL-2026-11-12-004), etapa 4 -- PDF del
// comprobante C (débito/crédito). La boleta de efectivo usa el PDF real
// de Haulmer (publicReceiptsDocument.mjs la pide por provider_token); el
// comprobante C NO es un documento del SII, así que ParkFacil arma su
// propio PDF -- mismo contenido que ya se ve en pantalla y en el correo
// (publicReceiptsEmailCore.mjs), con pdf-lib (sin Chromium, liviano,
// corre bien en una función serverless).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function formatCurrency(amount) {
  return `$${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(Number(amount || 0))}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(value));
}

const PAGE_WIDTH = 227; // ~80 mm, igual proporción que el ticket impreso
const MARGIN = 16;

export async function buildPublicReceiptCardPdf(row) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  const fontBold = await doc.embedFont(StandardFonts.CourierBold);

  const medio = row?.medio === "CREDITO" ? "Crédito" : row?.medio === "DEBITO" ? "Débito" : "Tarjeta";
  const emisor = row?.emisor;
  const lines = [
    ...(emisor ? [
      { text: emisor.businessName, bold: true, center: true },
      { text: `RUT ${emisor.rut}`, center: true },
      { text: emisor.address, center: true },
      { divider: true },
    ] : []),
    { text: "COMPROBANTE DE PAGO", bold: true, center: true },
    { text: "CON TARJETA", bold: true, center: true },
    { divider: true },
    { row: ["Estacionamiento", `${row?.parkingName || ""}${row?.city ? `, ${row.city}` : ""}`] },
    { row: ["Fecha", formatDate(row?.exitAt)] },
    { divider: true },
    { row: ["Neto", formatCurrency(row?.netAmount)] },
    { row: ["IVA", formatCurrency(row?.taxAmount)] },
    { row: ["TOTAL", formatCurrency(row?.totalAmount)], bold: true },
    { divider: true },
    { row: ["Venta", `${medio}${row?.cardLast4 ? ` ****${row.cardLast4}` : ""}`] },
    ...(row?.cardOperationNumber ? [{ row: ["N° operación", row.cardOperationNumber] }] : []),
    { row: ["Código", row?.paymentCode || ""] },
    { divider: true },
    { text: "El documento tributario de esta venta es el voucher", small: true, center: true },
    { text: "del terminal, válido como boleta. Este comprobante", small: true, center: true },
    { text: "es un respaldo informativo de ParkFacil.", small: true, center: true },
  ];

  const lineHeight = 13;
  const smallLineHeight = 10;
  const height = MARGIN * 2 + lines.reduce((sum, l) => sum + (l.small ? smallLineHeight : lineHeight), 0) + 10;
  const page = doc.addPage([PAGE_WIDTH, height]);
  let y = height - MARGIN;

  for (const line of lines) {
    if (line.divider) {
      page.drawLine({
        start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 0.5, color: rgb(0, 0, 0), dashArray: [2, 2],
      });
      y -= 8;
      continue;
    }
    const size = line.small ? 7 : 9;
    const usedFont = line.bold ? fontBold : font;
    if (line.row) {
      const [label, value] = line.row;
      page.drawText(label, { x: MARGIN, y, size, font: usedFont });
      const valueWidth = usedFont.widthOfTextAtSize(value, size);
      page.drawText(value, { x: PAGE_WIDTH - MARGIN - valueWidth, y, size, font: usedFont });
    } else {
      const textWidth = usedFont.widthOfTextAtSize(line.text, size);
      const x = line.center ? (PAGE_WIDTH - textWidth) / 2 : MARGIN;
      page.drawText(line.text, { x, y, size, font: usedFont });
    }
    y -= line.small ? smallLineHeight : lineHeight;
  }

  return doc.save();
}
