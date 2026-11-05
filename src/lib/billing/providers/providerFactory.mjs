import { MockBillingProviderAdapter } from "./MockBillingProviderAdapter.mjs";

// Punto único para elegir el proveedor de emisión de documentos (SOL-2026-11-05-005, F0).
// Hoy solo existe el proveedor simulado: los documentos no se envían al SII.
// F2 agrega Haulmer OpenFactura y la selección del proveedor desde Configuración (decisiones D6 y D8).
export const BILLING_PROVIDER_MODES = Object.freeze({ SIMULATED: "SIMULATED" });

export function currentBillingProviderMode() {
  return BILLING_PROVIDER_MODES.SIMULATED;
}

export function createBillingProvider({ scenario } = {}) {
  return new MockBillingProviderAdapter({ scenario: scenario || "success" });
}
