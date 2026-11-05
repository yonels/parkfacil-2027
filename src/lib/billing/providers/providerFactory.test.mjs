import test from "node:test";
import assert from "node:assert/strict";
import { BILLING_PROVIDER_MODES, createBillingProvider, currentBillingProviderMode } from "./providerFactory.mjs";

test("mientras no exista proveedor real, la emisión está en modo simulado", () => {
  assert.equal(currentBillingProviderMode(), BILLING_PROVIDER_MODES.SIMULATED);
});

test("la fábrica entrega un proveedor que emite con escenario por defecto exitoso", async () => {
  const result = await createBillingProvider().emitInvoice({ idempotencyKey: "factory-1", documentType: "INVOICE", issueDate: "2026-11-05", currency: "CLP", issuer: { rut: "1-9" }, customer: { rut: "2-7" }, lines: [{ description: "Servicio", quantity: 1, unitPrice: 1000 }], totals: { net: 1000, tax: 190, total: 1190 } });
  assert.equal(result.result, "ISSUED");
});
