// Proveedor de emisión Haulmer OpenFactura (SOL-2026-11-05-005, F2). Usa la misma lectura de respuestas que la
// boleta del POS (SOL-2026-10-20-001), ya probada contra dev-api: TOKEN/FOLIO, OF-06 (ya emitido), 401 y 429.
import { BillingProviderAdapter, BillingProviderError, PROVIDER_RESULTS, validateBillingDocumentRequest } from "./BillingProviderAdapter.mjs";
import { buildHaulmerDte, HAULMER_BASE_URLS } from "./haulmerDteCore.mjs";
import { parseBoletaResponse } from "../../boletaElectronica/openFacturaCore.mjs";
import { cachedIssuedPdf, rememberIssuedPdf } from "./haulmerPdfCache.mjs";

export class HaulmerBillingProviderAdapter extends BillingProviderAdapter {
  constructor({ environment = "TEST", apiKey, fetchImpl = fetch, timeoutMs = 20000, retryDelayMs = 3000 } = {}) {
    super();
    if (!HAULMER_BASE_URLS[environment]) throw new BillingProviderError("PROVIDER_ENVIRONMENT_INVALID", "Ambiente de Haulmer no válido.");
    this.environment = environment; this.apiKey = apiKey; this.fetchImpl = fetchImpl; this.timeoutMs = timeoutMs; this.retryDelayMs = retryDelayMs;
  }

  async #call(method, path, { body, idempotencyKey, timeoutMs = this.timeoutMs } = {}) {
    if (!this.apiKey) throw new BillingProviderError("PROVIDER_API_KEY_MISSING", "Falta la API Key de Haulmer en el servidor.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { apikey: this.apiKey };
      if (body) headers["Content-Type"] = "application/json";
      if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
      const response = await this.fetchImpl(`${HAULMER_BASE_URLS[this.environment]}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
      return { status: response.status, body: await response.json().catch(() => null) };
    } catch (error) {
      throw new BillingProviderError("PROVIDER_TIMEOUT", error?.name === "AbortError" ? "Haulmer no respondió a tiempo." : "No fue posible conectar con Haulmer.", { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }

  async #emit(request) {
    validateBillingDocumentRequest(request);
    const payload = buildHaulmerDte(request, { environment: this.environment });
    const { status, body } = await this.#call("POST", "/v2/dte/document", { body: payload, idempotencyKey: `parkfacil-${request.idempotencyKey}`.slice(0, 120) });
    let parsed;
    try { parsed = parseBoletaResponse(status, body); }
    catch (error) {
      const details = Array.isArray(error.details) ? error.details.map((d) => `${d.field || ""} ${d.issue || ""}`.trim()).filter(Boolean).join("; ") : "";
      // 401 es un problema de configuración (API Key), no un rechazo del documento: queda ISSUE_ERROR y se puede reintentar.
      if (status >= 400 && status < 500 && status !== 401 && !error.retryable) return { result: PROVIDER_RESULTS.REJECTED, provider: "haulmer", providerStatus: String(error.code || `HTTP_${status}`), providerCode: String(error.code || `HTTP_${status}`), message: `${error.message}${details ? ` (${details})` : ""}`, retryable: false };
      throw new BillingProviderError(error.code || "PROVIDER_ERROR", error.message, { retryable: Boolean(error.retryable) });
    }
    if (typeof body?.PDF === "string") rememberIssuedPdf(parsed.token, body.PDF);
    // OF-06 (la misma Idempotency-Key ya emitió): Haulmer devuelve solo el token; el folio se lee del documento.
    if (parsed.alreadyIssued && parsed.folio == null) {
      try { const stored = await this.getDocument(parsed.token, "json"); parsed.folio = stored?.json?.Encabezado?.IdDoc?.Folio ?? null; } catch { /* el folio se puede completar después */ }
    }
    return {
      result: parsed.alreadyIssued ? PROVIDER_RESULTS.DUPLICATE : PROVIDER_RESULTS.ISSUED,
      provider: "haulmer", providerDocumentId: parsed.token,
      providerStatus: this.environment === "TEST" ? "EMITIDO_PRUEBA" : "EMITIDO",
      folio: parsed.folio != null ? String(parsed.folio) : null, documentType: request.documentType, retryable: false,
    };
  }

  emitInvoice(request) { return this.#emit(request); }
  emitCreditNote(request) { return this.#emit(request); }
  emitDebitNote(request) { return this.#emit(request); }

  // value: status | json | pdf | xml | cedible (documentación «/document/{token}/{value}»).
  async getDocument(token, value = "json") {
    if (!/^[a-f0-9]{16,128}$/i.test(String(token || ""))) throw new BillingProviderError("PROVIDER_TOKEN_INVALID", "Token de documento no válido.");
    if (!["status", "json", "pdf", "xml", "cedible"].includes(value)) throw new BillingProviderError("PROVIDER_VALUE_INVALID", "Consulta no válida.");
    // El PDF se genera al momento si no se pidió al emitir: se espera más (probado en dev-api 2026-11-06).
    // Probado en dev-api (2026-11-06): recién emitido, el PDF responde HTTP 500 mientras Haulmer lo genera y luego
    // queda disponible. Se reintenta hasta 3 veces con 3 s de espera.
    if (value === "pdf") { const cached = cachedIssuedPdf(token); if (cached) return { pdf: cached }; }
    const isFile = value === "pdf" || value === "cedible";
    let status; let body;
    for (let attempt = 0; attempt < (isFile ? 4 : 1); attempt += 1) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
      ({ status, body } = await this.#call("GET", `/v2/dte/document/${token}/${value}`, { timeoutMs: isFile ? 60000 : this.timeoutMs }));
      if (status >= 200 && status < 300 && body) return body;
      if (status < 500) break;
    }
    throw new BillingProviderError(body?.error?.code || `HTTP_${status}`, body?.error?.message || "Haulmer no entregó el documento.", { retryable: status >= 500 || status === 429 });
  }

  // Documentos emitidos por el contribuyente de la API Key (SOL-2026-11-05-005, F2b). Documentación «/document/issued»:
  // POST con filtros { Page, TipoDTE, FchEmis, RUTRecep } y operadores eq/gte/lte; 30 documentos por página.
  async listIssued({ page = 1, from, to, dteType, receiverRutNumber } = {}) {
    const body = { Page: String(page) };
    if (from || to) body.FchEmis = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    if (dteType) body.TipoDTE = { eq: String(dteType) };
    if (receiverRutNumber) body.RUTRecep = { eq: Number(receiverRutNumber) };
    const { status, body: response } = await this.#call("POST", "/v2/dte/document/issued", { body });
    if (status === 429) throw new BillingProviderError("PROVIDER_RATE_LIMIT", "Haulmer pidió esperar antes de seguir consultando.", { retryable: true });
    if (status === 401) throw new BillingProviderError("DTE_API_KEY_REJECTED", "Haulmer rechazó la API Key.");
    if (status < 200 || status >= 300) throw new BillingProviderError(response?.error?.code || `HTTP_${status}`, response?.error?.message || "Haulmer no entregó el listado de documentos.", { retryable: status >= 500 });
    return { page: Number(response?.current_page || page), lastPage: Number(response?.last_page || 1), total: Number(response?.total || 0), data: Array.isArray(response?.data) ? response.data : [] };
  }

  // Folios disponibles por tipo de documento (SOL-2026-11-05-005, 2026-11-09). Respuesta real de dev-api:
  // { documentos: [{ dte: 33, disponibles: 294810, vencimiento: "2027-03-01" }, ...] }.
  async getAvailableFolios() {
    const { status, body } = await this.#call("GET", "/v2/dte/organization/document");
    if (status === 401) throw new BillingProviderError("DTE_API_KEY_REJECTED", "Haulmer rechazó la API Key.");
    if (status < 200 || status >= 300) throw new BillingProviderError(body?.error?.code || `HTTP_${status}`, body?.error?.message || "Haulmer no entregó los folios disponibles.", { retryable: status >= 500 || status === 429 });
    return Array.isArray(body?.documentos) ? body.documentos : [];
  }

  async getDocumentStatus(token) {
    const body = await this.getDocument(token, "status");
    // Respuesta real de dev-api (2026-11-06): { estado: "Aceptado", token }.
    return body?.estado || body?.status || null;
  }
}
