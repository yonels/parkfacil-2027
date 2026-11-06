// Correo con la factura o nota emitida (SOL-2026-11-05-005, F2). Lo envía ParkFacil por Microsoft Graph con el PDF
// que entrega Haulmer (decisión 2026-11-06: el envío del ambiente de pruebas de Haulmer no llegó). Código puro.
import { emailRecipients } from "./providers/haulmerDteCore.mjs";

const TITLES = { INVOICE: "Factura electrónica", CREDIT_NOTE: "Nota de crédito electrónica", DEBIT_NOTE: "Nota de débito electrónica" };
const FILES = { INVOICE: "factura", CREDIT_NOTE: "nota-credito", DEBIT_NOTE: "nota-debito" };

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const clp = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(value) || 0);
const chileDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || "")) ? String(iso).split("-").reverse().join("-") : "");

// Destinatarios: en producción el cliente (copias y copia oculta al emisor); en pruebas solo el emisor.
export function documentEmailRecipients({ issuer, customer, environment }) {
  const recipients = emailRecipients({ issuer: { ...issuer, sendEmailOnIssue: true }, customer }, { environment });
  if (!recipients) return null;
  return { para: recipients.to, cc: recipients.CC || "", bcc: recipients.BCC || "" };
}

export function buildDocumentEmail({ document, issuer = {}, customer = {}, environment }) {
  const title = TITLES[document.document_type] || "Documento tributario electrónico";
  const folio = document.folio || "s/f";
  const test = environment === "TEST";
  const issuerName = issuer.businessName || "ParkFacil";
  const asunto = `${test ? "[PRUEBA] " : ""}${title} N° ${folio} — ${issuerName}`;
  const rows = [
    ["Cliente", customer.businessName], ["RUT", customer.rut], ["Documento", `${title} N° ${folio}`],
    ["Fecha de emisión", chileDate(document.invoice_date)],
    document.document_type === "INVOICE" ? ["Vencimiento", chileDate(document.due_date)] : null,
    ["Neto", clp(document.net_amount)], ["IVA", clp(document.tax_amount)], ["Total", clp(document.total_amount)],
  ].filter(Boolean);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#041E42;font-size:14px">
<p>Estimado(a) cliente:</p>
<p>Adjuntamos la ${escapeHtml(title.toLowerCase())} N° ${escapeHtml(folio)} emitida por ${escapeHtml(issuerName)}.</p>
${test ? '<p style="color:#9A3412"><strong>Documento de prueba</strong>: emitido en el ambiente de desarrollo de Haulmer, sin validez tributaria.</p>' : ""}
<table style="border-collapse:collapse">${rows.map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;color:#475569">${escapeHtml(label)}</td><td style="padding:4px 0"><strong>${escapeHtml(value)}</strong></td></tr>`).join("")}</table>
<p>Saludos cordiales,<br>${escapeHtml(issuerName)}${issuer.email ? ` · ${escapeHtml(issuer.email)}` : ""}</p>
</div>`;
  return { asunto, html, fileName: `${FILES[document.document_type] || "documento"}-${folio}.pdf` };
}
