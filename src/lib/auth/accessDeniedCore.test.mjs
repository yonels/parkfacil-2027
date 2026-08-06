import test from "node:test";
import assert from "node:assert/strict";
import { createDeniedAccessEvent } from "./accessDeniedCore.mjs";

test("registra una denegación sin copiar secretos de la solicitud", () => {
  const request = new Request("https://cliente.parkfacilapp.cl/api/usuarios/user-b", {
    headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.1", authorization: "Bearer secreto" },
  });
  const event = createDeniedAccessEvent({
    request,
    context: { userId: "admin-a", companyId: "company-a", portal: "client" },
    error: { code: "RESOURCE_NOT_FOUND", status: 404 },
    now: new Date("2026-08-06T12:00:00.000Z"),
  });
  assert.deepEqual(event, {
    event: "access_denied", userId: "admin-a", companyId: "company-a", portal: "client",
    ip: "203.0.113.8", path: "/api/usuarios/user-b", occurredAt: "2026-08-06T12:00:00.000Z",
    reason: "RESOURCE_NOT_FOUND", httpStatus: 404,
  });
  assert.equal(JSON.stringify(event).includes("secreto"), false);
});
