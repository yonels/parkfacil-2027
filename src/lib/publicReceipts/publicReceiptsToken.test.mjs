import test from "node:test";
import assert from "node:assert/strict";
import { issuePublicReceiptsToken, verifyPublicReceiptsToken, tokenAuthorizesStay } from "./publicReceiptsToken.mjs";

const SECRET = "secreto-de-prueba";
const NOW = new Date("2026-11-13T12:00:00Z");

test("emite y verifica un token válido dentro de los 15 minutos", () => {
  const token = issuePublicReceiptsToken({ plate: "CXPY-93", stayIds: ["s1", "s2"], secret: SECRET, now: NOW });
  const verified = verifyPublicReceiptsToken(token, SECRET, new Date(NOW.getTime() + 10 * 60 * 1000));
  assert.equal(verified.ok, true);
  assert.equal(verified.plate, "CXPY-93");
  assert.deepEqual(verified.stayIds, ["s1", "s2"]);
});

test("el token expira a los 15 minutos", () => {
  const token = issuePublicReceiptsToken({ plate: "CXPY-93", stayIds: ["s1"], secret: SECRET, now: NOW });
  const verified = verifyPublicReceiptsToken(token, SECRET, new Date(NOW.getTime() + 15 * 60 * 1000 + 1));
  assert.equal(verified.ok, false);
  assert.equal(verified.code, "EXPIRED");
});

test("rechaza un token firmado con otro secreto", () => {
  const token = issuePublicReceiptsToken({ plate: "CXPY-93", stayIds: ["s1"], secret: SECRET, now: NOW });
  const verified = verifyPublicReceiptsToken(token, "otro-secreto", NOW);
  assert.equal(verified.ok, false);
  assert.equal(verified.code, "INVALID_SIGNATURE");
});

test("rechaza un token manipulado (payload alterado)", () => {
  const token = issuePublicReceiptsToken({ plate: "CXPY-93", stayIds: ["s1"], secret: SECRET, now: NOW });
  const [payload] = token.split(".");
  const tampered = `${payload}AA.${token.split(".")[1]}`;
  const verified = verifyPublicReceiptsToken(tampered, SECRET, NOW);
  assert.equal(verified.ok, false);
});

test("rechaza texto malformado o vacío", () => {
  assert.equal(verifyPublicReceiptsToken("", SECRET, NOW).ok, false);
  assert.equal(verifyPublicReceiptsToken("solo-una-parte", SECRET, NOW).ok, false);
});

test("tokenAuthorizesStay solo autoriza los stayId incluidos en el token", () => {
  const token = issuePublicReceiptsToken({ plate: "CXPY-93", stayIds: ["s1", "s2"], secret: SECRET, now: NOW });
  const verified = verifyPublicReceiptsToken(token, SECRET, NOW);
  assert.equal(tokenAuthorizesStay(verified, "s1"), true);
  assert.equal(tokenAuthorizesStay(verified, "s9"), false);
  assert.equal(tokenAuthorizesStay({ ok: false }, "s1"), false);
});
