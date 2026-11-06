import "server-only";
import { sendMicrosoftGraphMail } from "../microsoftGraphMailCore.js";
import { buildDocumentEmail, documentEmailRecipients } from "./documentEmailCore.mjs";
import { issuerForDocument } from "./settingsCore.mjs";
import { readSettingsRow } from "./settingsRepository";
import { providerFor } from "./providers/providerResolver";

// Envía por correo un documento emitido con Haulmer, con su PDF adjunto (SOL-2026-11-05-005, F2).
// Nunca hace fallar la emisión: registra el resultado en el documento (email_status, email_to, email_error).
// force = true (botón «Enviar por correo») envía aunque la opción automática esté apagada.
async function record(db, id, values) {
  await db.from("billing_documents").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id);
}

export async function sendDocumentEmail({ db, documentId, force = false, sendMail = sendMicrosoftGraphMail }) {
  const { data: document, error } = await db.from("billing_documents").select("id,document_type,folio,invoice_date,due_date,net_amount,tax_amount,total_amount,status,provider,provider_document_id,customer_snapshot").eq("id", documentId).maybeSingle();
  if (error) throw error;
  if (!document) return { status: "SKIPPED", reason: "Documento no encontrado." };
  const settings = await readSettingsRow(db);
  if (!force && !settings.send_email_on_issue) return { status: "SKIPPED", reason: "El envío automático por correo está apagado." };
  if (document.status !== "ISSUED") return { status: "SKIPPED", reason: "El documento aún no está emitido." };
  if (document.provider !== "haulmer" || !document.provider_document_id) {
    const reason = "Documento simulado: no tiene PDF tributario para enviar.";
    if (force) await record(db, document.id, { email_status: "SKIPPED", email_error: reason });
    return { status: "SKIPPED", reason };
  }
  const environment = settings.provider_environment === "PRODUCTION" ? "PRODUCTION" : "TEST";
  const { issuer } = issuerForDocument(settings);
  const customer = document.customer_snapshot || {};
  const recipients = documentEmailRecipients({ issuer, customer, environment });
  if (!recipients) {
    const reason = environment === "TEST" ? "Falta el correo del emisor en Configuración." : "El cliente no tiene correo de facturación.";
    await record(db, document.id, { email_status: "SKIPPED", email_error: reason });
    return { status: "SKIPPED", reason };
  }
  try {
    const pdf = await (await providerFor(db, "haulmer")).getDocument(document.provider_document_id, "pdf");
    if (!pdf?.pdf) throw new Error("Haulmer no entregó el PDF.");
    const email = buildDocumentEmail({ document, issuer, customer, environment });
    await sendMail({ ...recipients, asunto: email.asunto, html: email.html, attachments: [{ name: email.fileName, contentType: "application/pdf", contentBytes: String(pdf.pdf) }] });
    await record(db, document.id, { email_status: "SENT", email_to: recipients.para, email_sent_at: new Date().toISOString(), email_error: null });
    return { status: "SENT", to: recipients.para };
  } catch (sendError) {
    const reason = String(sendError?.message || "No fue posible enviar el correo.").slice(0, 300);
    await record(db, document.id, { email_status: "FAILED", email_to: recipients.para, email_error: reason });
    return { status: "FAILED", reason };
  }
}
