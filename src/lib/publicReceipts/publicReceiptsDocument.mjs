import "server-only";
import { decryptDteApiKey } from "../boletaElectronica/dteSettingsCore.mjs";
import { HaulmerBillingProviderAdapter } from "../billing/providers/HaulmerBillingProviderAdapter.mjs";
import { buildPublicReceiptCardPdf } from "./publicReceiptsPdfCore.mjs";

// «Consulte su boleta» (SOL-2026-11-12-004), etapa 4 -- el PDF real de
// cada fila. Efectivo: el PDF oficial del SII, pedido a Haulmer por
// provider_token con la API Key de la EMPRESA emisora (nunca la de
// ParkFacil) -- mismo patrón que documentEmailService.js (facturación
// Root), reutilizando el mismo adaptador (su getDocument ya reintenta los
// 500 de "PDF recién emitido"). Tarjeta: no hay documento del SII -- se
// arma un PDF propio con los mismos datos del comprobante C.
export async function fetchPublicReceiptPdf(db, { row }) {
  if (row.kind === "CARD") {
    const pdfBytes = await buildPublicReceiptCardPdf(row);
    return { ok: true, pdf: Buffer.from(pdfBytes).toString("base64"), fileName: `comprobante-${row.paymentCode || row.stayId}.pdf` };
  }

  // CASH: pide el provider_token y la configuración DTE de la empresa.
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
