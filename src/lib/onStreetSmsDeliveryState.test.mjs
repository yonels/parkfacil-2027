import test from "node:test";
import assert from "node:assert/strict";
import { notificationDeliveryState, resolveSmsPublicOrigin } from "./onStreetSms.mjs";

// Separado de onStreetSms.test.mjs a propósito: ese archivo lee además la
// migración T-15 y la ruta pública de sesión (ambas fuera del alcance de
// este commit, ver auditoría de integración Sentraland). Este archivo
// importa únicamente el módulo mínimo necesario — onStreetSms.mjs no tiene
// ninguna dependencia externa — para no arrastrar nada del módulo On
// Street QR completo.

test("un aviso simulado se distingue explícitamente como SIMULATED, nunca como DELIVERED", () => {
  assert.equal(notificationDeliveryState({ status: "SENT", provider: "SIMULATED", delivered_at: null, accepted_at: "2026-01-01" }), "SIMULATED");
});
test("un aviso real aceptado pero sin confirmación de entrega es ACCEPTED, no DELIVERED", () => {
  assert.equal(notificationDeliveryState({ status: "SENT", provider: "SENTRALAND", delivered_at: null, accepted_at: "2026-01-01" }), "ACCEPTED");
});
test("un aviso real con delivered_at es DELIVERED", () => {
  assert.equal(notificationDeliveryState({ status: "SENT", provider: "SENTRALAND", delivered_at: "2026-01-01", accepted_at: "2026-01-01" }), "DELIVERED");
});
test("un aviso FAILED se reporta como FAILED sin importar el proveedor", () => {
  assert.equal(notificationDeliveryState({ status: "FAILED", provider: "SENTRALAND" }), "FAILED");
});

test("produccion rechaza localhost y exige HTTPS para el link SMS", () => {
  assert.throws(() => resolveSmsPublicOrigin({ configuredOrigin: "http://localhost:3000", nodeEnv: "production" }), { code: "SMS_PUBLIC_ORIGIN_UNSAFE" });
  assert.throws(() => resolveSmsPublicOrigin({ configuredOrigin: "http://cliente.parkfacilapp.cl", nodeEnv: "production" }), { code: "SMS_PUBLIC_ORIGIN_UNSAFE" });
  assert.equal(resolveSmsPublicOrigin({ configuredOrigin: "https://cliente.parkfacilapp.cl/", nodeEnv: "production" }), "https://cliente.parkfacilapp.cl");
});
