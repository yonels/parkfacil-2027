import "server-only";
import { DteImportError, fromHaulmerIssued } from "./dteRegistryCore.mjs";
import { applyDteImport, clientReceiverRuts, recordFailedImport } from "./dteRegistryRepository";
import { readSettingsRow } from "./settingsRepository";
import { HaulmerBillingProviderAdapter } from "./providers/HaulmerBillingProviderAdapter.mjs";
import { haulmerApiKey } from "./providers/providerResolver";

// Sincronización de documentos emitidos por Haulmer (SOL-2026-11-05-005, F2b, D10). Haulmer permite 3 consultas por
// segundo y 100 por minuto: se espera 0,7 s entre páginas y se corta en maxRequests.
const PAUSE_MS = 700;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function defaultSyncRange(today = new Date(), days = 7) {
  const to = new Date(today.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10); // hora de Chile aproximada
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

// 429 de Haulmer: la clave pública de pruebas la comparten todos los integradores, así que el límite se alcanza aunque
// ParkFacil consulte poco. Se espera y se reintenta hasta 3 veces antes de fallar.
async function listWithRetry(client, filters, waitMs) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await client.listIssued(filters); }
    catch (error) {
      if (error?.code !== "PROVIDER_RATE_LIMIT" || attempt >= 3) throw error;
      await sleep(waitMs * (attempt + 1));
    }
  }
}

export async function syncHaulmerIssued(db, { from, to, actorId = null, maxRequests = 80, adapter, retryWaitMs = 10000 } = {}) {
  const range = from && to ? { from, to } : defaultSyncRange();
  if (range.from > range.to) throw new DteImportError("DTE_RANGE_INVALID", "La fecha desde no puede ser posterior a la fecha hasta.");
  const settings = await readSettingsRow(db);
  if (settings.invoice_provider !== "HAULMER") throw new DteImportError("PROVIDER_NOT_HAULMER", "La sincronización requiere Haulmer como proveedor en Facturación → Configuración.");
  const environment = settings.provider_environment === "PRODUCTION" ? "PRODUCTION" : "TEST";
  const client = adapter || new HaulmerBillingProviderAdapter({ environment, apiKey: haulmerApiKey(environment) });
  // En pruebas la empresa emisora de Haulmer es compartida: solo se traen documentos a nuestras empresas cliente.
  const receivers = environment === "TEST" ? await clientReceiverRuts(db) : [null];
  const items = [];
  let requests = 0;
  let truncated = false;
  try {
    outer: for (const rut of receivers) {
      let page = 1;
      let lastPage = 1;
      do {
        if (requests >= maxRequests) { truncated = true; break outer; }
        if (requests) await sleep(PAUSE_MS);
        const result = await listWithRetry(client, { page, from: range.from, to: range.to, receiverRutNumber: rut ? rut.split("-")[0] : undefined }, retryWaitMs);
        requests += 1;
        lastPage = result.lastPage;
        for (const doc of result.data) { const item = fromHaulmerIssued(doc); if (item) items.push(item); }
        page += 1;
      } while (page <= lastPage);
    }
  } catch (error) {
    await recordFailedImport(db, { source: "HAULMER", message: error.message, actorId });
    throw error;
  }
  const unique = [...new Map(items.map((item) => [`${item.dteType}-${item.folio}`, item])).values()];
  const summary = await applyDteImport(db, { source: "HAULMER", items: unique, totalRows: unique.length, period: range, actorId, commit: true });
  return { ...summary, environment, range, requests, truncated, receivers: environment === "TEST" ? receivers.length : null };
}
