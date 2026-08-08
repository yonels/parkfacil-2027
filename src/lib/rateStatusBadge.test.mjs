import test from "node:test";
import assert from "node:assert/strict";
import { rateStatusBadge } from "./rateStatusBadge.mjs";

test("REQUIRES_REVIEW nunca aparece como Activa, aunque el status legacy sea ACTIVE", () => {
  const rate = { status: "ACTIVE", compliance: { status: "REQUIRES_REVIEW", reasons: ["x"] } };
  const badge = rateStatusBadge(rate);
  assert.equal(badge.label, "Requiere revisión");
  assert.notEqual(badge.label, "Activa");
});

test("REQUIRES_REVIEW nunca aparece como Activa tampoco si el status legacy es DRAFT", () => {
  const rate = { status: "DRAFT", compliance: { status: "REQUIRES_REVIEW", reasons: ["x"] } };
  assert.equal(rateStatusBadge(rate).label, "Requiere revisión");
});

test("una tarifa VALID y ACTIVE se muestra como Activa", () => {
  const rate = { status: "ACTIVE", compliance: { status: "VALID", reasons: [] } };
  assert.equal(rateStatusBadge(rate).label, "Activa");
});

test("una tarifa VALID y DRAFT se muestra como Borrador", () => {
  const rate = { status: "DRAFT", compliance: { status: "VALID", reasons: [] } };
  assert.equal(rateStatusBadge(rate).label, "Borrador");
});

test("una tarifa SUSPENDED se muestra como Suspendida, no como Borrador", () => {
  const rate = { status: "SUSPENDED", compliance: { status: "VALID", reasons: [] } };
  assert.equal(rateStatusBadge(rate).label, "Suspendida");
});

test("una tarifa ENDED (reemplazada por una nueva versión) se muestra como Finalizada, no como Activa ni Borrador", () => {
  const rate = { status: "ENDED", compliance: { status: "VALID", reasons: [] } };
  const badge = rateStatusBadge(rate);
  assert.equal(badge.label, "Finalizada");
  assert.notEqual(badge.label, "Activa");
  assert.notEqual(badge.label, "Borrador");
});

test("REQUIRES_REVIEW tiene prioridad incluso sobre SUSPENDED o ENDED", () => {
  assert.equal(rateStatusBadge({ status: "SUSPENDED", compliance: { status: "REQUIRES_REVIEW", reasons: ["x"] } }).label, "Requiere revisión");
  assert.equal(rateStatusBadge({ status: "ENDED", compliance: { status: "REQUIRES_REVIEW", reasons: ["x"] } }).label, "Requiere revisión");
});
