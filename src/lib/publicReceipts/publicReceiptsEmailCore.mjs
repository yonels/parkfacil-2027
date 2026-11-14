// «Consulte su boleta» (SOL-2026-11-12-004), etapa 6 -- contenido del
// correo. Reglas puras, sin Microsoft Graph ni DOM, mismo criterio que el
// resto de módulos "*Core.mjs". El envío real vive en el endpoint
// (send/route.js), que solo llama a sendMicrosoftGraphMail con lo que esta
// función arma.
//
// Qué documento mostrar (boleta real o comprobante C) se decide por
// `row.document`, no por el medio de pago (`row.kind`): desde la etapa 3
// un pago con tarjeta en línea (Webpay) también puede tener boleta real.

function formatCurrency(amount) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(amount || 0));
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

export function publicReceiptEmailSubject(row) {
  if (row?.document === "BOLETA") return `Boleta electrónica${row.folio ? ` N° ${row.folio}` : ""} — ParkFacil`;
  return "Comprobante de pago con tarjeta — ParkFacil";
}

export function buildPublicReceiptEmailHtml(row) {
  const emisor = row?.emisor;
  const esBoleta = row?.document === "BOLETA";
  const titulo = esBoleta ? `Boleta electrónica${row.folio ? ` N° ${row.folio}` : ""}` : "Comprobante de pago con tarjeta";
  const medio = row?.kind === "CASH"
    ? "Efectivo"
    : `${row.medio === "CREDITO" ? "Crédito" : row.medio === "DEBITO" ? "Débito" : "Tarjeta"}${row.cardLast4 ? ` ****${row.cardLast4}` : ""}`;

  const legend = esBoleta
    ? "Timbre Electrónico SII (representación impresa)."
    : "El documento tributario de esta venta es el voucher del terminal, válido como boleta. Este comprobante es un respaldo informativo de ParkFacil.";

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;padding:20px;color:#172033">
    ${emisor ? `<p style="text-align:center;margin:0 0 4px;font-weight:bold">${escapeHtml(emisor.businessName)}</p>
    <p style="text-align:center;margin:0 0 4px">RUT ${escapeHtml(emisor.rut)}</p>
    <p style="text-align:center;margin:0 0 12px">${escapeHtml(emisor.address)}</p>
    <hr style="border:none;border-top:1px dashed #94a3b8;margin:12px 0">` : ""}
    <p style="text-align:center;font-weight:bold;margin:0 0 12px">${escapeHtml(titulo)}</p>
    <table style="width:100%;font-size:14px;border-collapse:collapse">
      <tr><td>Estacionamiento</td><td style="text-align:right">${escapeHtml(row?.parkingName)}${row?.city ? `, ${escapeHtml(row.city)}` : ""}</td></tr>
      <tr><td>Fecha</td><td style="text-align:right">${formatDate(row?.exitAt)}</td></tr>
      <tr><td colspan="2"><hr style="border:none;border-top:1px dashed #94a3b8;margin:8px 0"></td></tr>
      <tr><td>Neto</td><td style="text-align:right">${formatCurrency(row?.netAmount)}</td></tr>
      <tr><td>IVA</td><td style="text-align:right">${formatCurrency(row?.taxAmount)}</td></tr>
      <tr><td style="font-weight:bold">Total</td><td style="text-align:right;font-weight:bold">${formatCurrency(row?.totalAmount)}</td></tr>
      <tr><td colspan="2"><hr style="border:none;border-top:1px dashed #94a3b8;margin:8px 0"></td></tr>
      <tr><td>Medio de pago</td><td style="text-align:right">${escapeHtml(medio)}</td></tr>
      ${row?.kind === "CARD" && row?.cardOperationNumber ? `<tr><td>N° operación</td><td style="text-align:right">${escapeHtml(row.cardOperationNumber)}</td></tr>` : ""}
      <tr><td>Código</td><td style="text-align:right">${escapeHtml(row?.paymentCode)}</td></tr>
    </table>
    <p style="margin-top:16px;font-size:12px;color:#5e6b84">${escapeHtml(legend)}</p>
  </div>`;
}

export function buildPublicReceiptEmail(row) {
  return { subject: publicReceiptEmailSubject(row), html: buildPublicReceiptEmailHtml(row) };
}

// Lote (sección 3 de DISENO.md): un correo con el PDF combinado adjunto.
// El HTML es solo un resumen -- el detalle de cada documento va en el PDF.
export function buildPublicReceiptsBatchEmail(rows) {
  const items = (rows || []).map((row) => {
    const medio = row.document === "BOLETA"
      ? (row.folio ? `Boleta N° ${row.folio}` : "Boleta electrónica")
      : `Comprobante de pago con tarjeta (${row.medio === "CREDITO" ? "crédito" : "débito"}${row.cardLast4 ? ` ****${row.cardLast4}` : ""})`;
    return `<li>${escapeHtml(medio)} — ${escapeHtml(formatDate(row.exitAt))} — ${escapeHtml(formatCurrency(row.totalAmount))}</li>`;
  }).join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;padding:20px;color:#172033">
    <p style="font-weight:bold;margin:0 0 12px">Sus ${rows.length} documentos de ParkFacil</p>
    <p style="margin:0 0 12px;font-size:14px">Adjuntamos un solo PDF con el detalle de cada uno:</p>
    <ul style="margin:0;padding-left:18px;font-size:14px">${items}</ul>
    <p style="margin-top:16px;font-size:12px;color:#5e6b84">Boletas: Timbre Electrónico SII (representación impresa). Comprobantes de pago con tarjeta: el documento tributario de esa venta es el voucher del terminal, válido como boleta.</p>
  </div>`;

  return { subject: `${rows.length} documentos — ParkFacil`, html };
}
