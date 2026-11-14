import "server-only";
import { PDFDocument } from "pdf-lib";
import { decryptDteApiKey } from "../boletaElectronica/dteSettingsCore.mjs";
import { HaulmerBillingProviderAdapter } from "../billing/providers/HaulmerBillingProviderAdapter.mjs";
import { buildPublicReceiptCardPdf } from "./publicReceiptsPdfCore.mjs";

export const PUBLIC_RECEIPTS_BATCH_LIMIT = 20;

// «Consulte su boleta» (SOL-2026-11-12-004), etapa 4 -- el PDF real de
// cada fila. Boleta (efectivo, o tarjeta Webpay desde la etapa 3): el PDF
// oficial del SII, pedido a Haulmer por provider_token con la API Key de
// la EMPRESA emisora (nunca la de ParkFacil) -- mismo patrón que
// documentEmailService.js (facturación Root), reutilizando el mismo
// adaptador (su getDocument ya reintenta los 500 de "PDF recién
// emitido"). Comprobante C (tarjeta TUU, sin boleta): no hay documento
// del SII -- se arma un PDF propio.
export async function fetchPublicReceiptPdf(db, { row }) {
  if (row.document !== "BOLETA") {
    const pdfBytes = await buildPublicReceiptCardPdf(row);
    return { ok: true, pdf: Buffer.from(pdfBytes).toString("base64"), fileName: `comprobante-${row.paymentCode || row.stayId}.pdf` };
  }

  // Boleta: pide el provider_token y la configuración DTE de la empresa.
  const boleta = await db
    .from("parking_stay_dte_documents")
    .select("provider_token,company_id")
    .eq("stay_id", row.stayId)
    .eq("status", "ISSUED")
    .maybeSingle();
  if (boleta.error) throw boleta.error;
  if (!boleta.data?.provider_token) {
    return { ok: false, code: "RECEIPT_PDF_NOT_AVAILABLE", mensaje: "Esta boleta no tiene PDF disponible." };
  }

  const settings = await db
    .from("company_dte_settings")
    .select("environment,api_key_ciphertext")
    .eq("company_id", boleta.data.company_id)
    .maybeSingle();
  if (settings.error) throw settings.error;
  if (!settings.data?.api_key_ciphertext) {
    return { ok: false, code: "RECEIPT_PDF_NOT_AVAILABLE", mensaje: "Esta boleta no tiene PDF disponible." };
  }

  let apiKey;
  try {
    apiKey = decryptDteApiKey(settings.data.api_key_ciphertext);
  } catch (error) {
    console.error("[public-receipts:pdf] decrypt_failed", { message: error?.message });
    return { ok: false, code: "RECEIPT_PDF_UNAVAILABLE", mensaje: "No fue posible obtener el PDF en este momento." };
  }

  try {
    const provider = new HaulmerBillingProviderAdapter({ environment: settings.data.environment, apiKey });
    const result = await provider.getDocument(boleta.data.provider_token, "pdf");
    if (!result?.pdf) return { ok: false, code: "RECEIPT_PDF_UNAVAILABLE", mensaje: "No fue posible obtener el PDF en este momento." };
    return { ok: true, pdf: result.pdf, fileName: `boleta-${row.folio || row.paymentCode || row.stayId}.pdf` };
  } catch (error) {
    console.error("[public-receipts:pdf] haulmer_failed", { code: error?.code, message: error?.message });
    return { ok: false, code: "RECEIPT_PDF_UNAVAILABLE", mensaje: "No fue posible obtener el PDF en este momento." };
  }
}

// Lote combinado (sección 3 de DISENO.md): un solo PDF con hasta 20
// documentos, uno por página (cada boleta/comprobante ya es de una sola
// página). Los documentos que fallen (p. ej. una boleta sin PDF
// disponible) se omiten del combinado en vez de hacer fallar todo el
// lote -- se informan aparte para que la interfaz avise cuáles faltaron.
export async function fetchPublicReceiptsBatchPdf(db, { rows }) {
  const limited = rows.slice(0, PUBLIC_RECEIPTS_BATCH_LIMIT);
  const combined = await PDFDocument.create();
  const omitted = [];

  for (const row of limited) {
    const result = await fetchPublicReceiptPdf(db, { row });
    if (!result.ok) {
      omitted.push({ stayId: row.stayId, code: result.code });
      continue;
    }
    try {
      const individual = await PDFDocument.load(Buffer.from(result.pdf, "base64"));
      const pages = await combined.copyPages(individual, individual.getPageIndices());
      pages.forEach((page) => combined.addPage(page));
    } catch (error) {
      console.error("[public-receipts:pdf] merge_failed", { stayId: row.stayId, message: error?.message });
      omitted.push({ stayId: row.stayId, code: "RECEIPT_PDF_MERGE_FAILED" });
    }
  }

  if (combined.getPageCount() === 0) {
    return { ok: false, code: "RECEIPT_PDF_UNAVAILABLE", mensaje: "No fue posible obtener ningún documento." };
  }

  const bytes = await combined.save();
  return { ok: true, pdf: Buffer.from(bytes).toString("base64"), fileName: "comprobantes-parkfacil.pdf", omitted, includedCount: limited.length - omitted.length };
}
