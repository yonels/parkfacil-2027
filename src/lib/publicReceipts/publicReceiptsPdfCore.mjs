// «Consulte su boleta» (SOL-2026-11-12-004), etapa 4 -- PDF del
// comprobante C (débito/crédito). La boleta de efectivo usa el PDF real
// de Haulmer (publicReceiptsDocument.mjs la pide por provider_token); el
// comprobante C NO es un documento del SII, así que ParkFacil arma su
// propio PDF -- mismo contenido que ya se ve en pantalla y en el correo
// (publicReceiptsEmailCore.mjs), con pdf-lib (sin Chromium, liviano,
// corre bien en una función serverless).
//
// Corrección 2026-11-14: la primera versión usaba un ancho de 80 mm (como
// un ticket térmico real) con Courier -- una fuente monoespaciada mucho
// más ancha por carácter que una tipografía normal. Con nombres de
// estacionamiento o direcciones largas, el texto se salía de la página
// (se veía cortado a los costados) o la etiqueta y el valor de una fila
// quedaban pegados. Esto es un PDF para ver en pantalla o imprimir en
// hoja normal, no un ticket térmico real, así que se ensancha la página y
// además cada línea se ajusta (word-wrap) o, si una fila no entra en una
// sola línea, el valor pasa a la línea de abajo -- nunca se recorta ni se
// superpone texto.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function formatCurrency(amount) {
  return `$${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(Number(amount || 0))}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(value));
}

const PAGE_WIDTH = 340;
const MARGIN = 24;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Parte `text` en líneas que entran en `maxWidth` con esa fuente/tamaño.
// Si una sola palabra ya es más ancha que maxWidth (código largo sin
// espacios), se deja igual en su propia línea -- nunca se corta una
// palabra a la mitad.
function wrapText(text, font, size, maxWidth) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildPublicReceiptCardPdf(row) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const medio = row?.medio === "CREDITO" ? "Crédito" : row?.medio === "DEBITO" ? "Débito" : "Tarjeta";
  const emisor = row?.emisor;
  const blocks = [
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
    { text: "El documento tributario de esta venta es el voucher del terminal, válido como boleta. Este comprobante es un respaldo informativo de ParkFacil.", small: true, center: true },
  ];

  // Primera pasada: cada bloque se convierte en una o más "líneas de
  // dibujo" ya ajustadas al ancho de la página -- nunca se calcula el
  // ancho total de una fila sin medir antes si entra.
  const GAP = 10; // espacio mínimo entre etiqueta y valor en una misma línea.
  const drawLines = [];
  for (const block of blocks) {
    if (block.divider) {
      drawLines.push({ divider: true });
      continue;
    }
    const size = block.small ? 8 : 10;
    const usedFont = block.bold ? fontBold : font;

    if (block.row) {
      const [label, value] = block.row;
      const labelWidth = font.widthOfTextAtSize(label, size);
      const valueWidth = usedFont.widthOfTextAtSize(value, size);
      if (labelWidth + GAP + valueWidth <= CONTENT_WIDTH) {
        drawLines.push({ label, value, size, font: usedFont, sameLine: true });
      } else {
        // No entran en una sola línea: la etiqueta va arriba y el valor
        // (ajustado si hace falta) va alineado a la derecha debajo.
        drawLines.push({ text: label, size, font, align: "left" });
        wrapText(value, usedFont, size, CONTENT_WIDTH).forEach((line) => {
          drawLines.push({ text: line, size, font: usedFont, align: "right" });
        });
      }
      continue;
    }

    wrapText(block.text, usedFont, size, CONTENT_WIDTH).forEach((line) => {
      drawLines.push({ text: line, size, font: usedFont, align: block.center ? "center" : "left" });
    });
  }

  const lineHeight = (size) => size + 5;
  const height = MARGIN * 2 + drawLines.reduce((sum, l) => sum + (l.divider ? 10 : lineHeight(l.size)), 0);
  const page = doc.addPage([PAGE_WIDTH, height]);
  let y = height - MARGIN;

  for (const line of drawLines) {
    if (line.divider) {
      page.drawLine({
        start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 0.5, color: rgb(0, 0, 0), dashArray: [2, 2],
      });
      y -= 10;
      continue;
    }
    if (line.sameLine) {
      page.drawText(line.label, { x: MARGIN, y, size: line.size, font });
      const valueWidth = line.font.widthOfTextAtSize(line.value, line.size);
      page.drawText(line.value, { x: PAGE_WIDTH - MARGIN - valueWidth, y, size: line.size, font: line.font });
    } else {
      const textWidth = line.font.widthOfTextAtSize(line.text, line.size);
      const x = line.align === "center" ? (PAGE_WIDTH - textWidth) / 2 : line.align === "right" ? PAGE_WIDTH - MARGIN - textWidth : MARGIN;
      page.drawText(line.text, { x, y, size: line.size, font: line.font });
    }
    y -= lineHeight(line.size);
  }

  return doc.save();
}
