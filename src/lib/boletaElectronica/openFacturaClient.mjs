import { boletaIdempotencyKey, openFacturaDocumentUrl, OpenFacturaError, parseBoletaResponse } from "./openFacturaCore.mjs";

// Cliente HTTP de OpenFactura (SOL-2026-10-20-001). Solo servidor: recibe la
// API Key ya descifrada y nunca la registra.
export async function emitBoleta({ environment, apiKey, request, paymentCode, fetchImpl = fetch, timeoutMs = 15000 }) {
  if (!apiKey) throw new OpenFacturaError("DTE_API_KEY_MISSING", "La empresa no tiene API Key de Haulmer.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(openFacturaDocumentUrl(environment), {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey, "Idempotency-Key": boletaIdempotencyKey(paymentCode) },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch (error) {
    throw new OpenFacturaError("DTE_NETWORK", error?.name === "AbortError" ? "Haulmer no respondió a tiempo." : "No fue posible conectar con Haulmer.", { retryable: true });
  } finally {
    clearTimeout(timer);
  }
  const body = await response.json().catch(() => null);
  return parseBoletaResponse(response.status, body);
}
