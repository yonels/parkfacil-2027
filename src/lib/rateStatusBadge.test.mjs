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
