import "server-only";
import { readSettingsRow } from "../settingsRepository";
import { createBillingProvider } from "./providerFactory.mjs";
import { HaulmerBillingProviderAdapter } from "./HaulmerBillingProviderAdapter.mjs";

// Elige el proveedor de emisión según Facturación → Configuración (SOL-2026-11-05-005, F2; D6, D8 y D9).
// La API Key de Haulmer vive solo en variables de entorno del servidor: OPENFACTURA_TEST_API_KEY (clave
// pública de prueba de Haulmer, ambiente de desarrollo) u OPENFACTURA_API_KEY (clave propia de ParkFacil, cuando
// se contrate OpenFactura).
export function haulmerApiKey(environment) {
  return environment === "PRODUCTION" ? process.env.OPENFACTURA_API_KEY : process.env.OPENFACTURA_TEST_API_KEY;
}

export async function activeProviderName(db) {
  const settings = await readSettingsRow(db);
  return settings.invoice_provider === "HAULMER" ? "haulmer" : "mock";
}

export async function providerFor(db, name, { scenario } = {}) {
  if (name !== "haulmer") return createBillingProvider({ scenario });
  const settings = await readSettingsRow(db);
  const environment = settings.provider_environment === "PRODUCTION" ? "PRODUCTION" : "TEST";
  return new HaulmerBillingProviderAdapter({ environment, apiKey: haulmerApiKey(environment) });
}
