import assert from "node:assert/strict";
import test from "node:test";
import { QR_EXIT_STATUS, extractStayQrToken, qrExitMessage, resolveStayFromQr } from "./qrExitCore.mjs";

const TOKEN_A = "3f1c2b7e-9a4d-4c1e-8b2a-0d9e8f7a6b5c";
const TOKEN_B = "11111111-2222-4333-8444-555555555555";
const stays = [
  { id: "s1", code: "PF-001-0001", license_plate: "QAPR01", qr_token: TOKEN_A, status: "OPEN" },
  { id: "s2", code: "PF-001-0002", license_plate: "QAPR02", qr_token: TOKEN_B, status: "OPEN" },
];

test("el QR del ticket (qr_token) ubica la estadía abierta", () => {
  const result = resolveStayFromQr(stays, TOKEN_A);
  assert.equal(result.status, QR_EXIT_STATUS.FOUND);
  assert.equal(result.stay.id, "s1");
});

test("tolera mayúsculas, espacios y el token embebido en un texto/URL", () => {
  assert.equal(resolveStayFromQr(stays, `  ${TOKEN_B.toUpperCase()}  `).stay.id, "s2");
  assert.equal(resolveStayFromQr(stays, `https://x.cl/t/${TOKEN_A}`).stay.id, "s1");
  assert.equal(extractStayQrToken("sin token"), null);
});

test("respaldo manual: el código del ticket escrito por el operador", () => {
  assert.equal(resolveStayFromQr(stays, "pf-001-0002").stay.id, "s2");
});

test("ticket de otra estadía / ya salió / otro estacionamiento -> NOT_FOUND, nunca otra estadía", () => {
  assert.equal(resolveStayFromQr(stays, "99999999-2222-4333-8444-555555555555").status, QR_EXIT_STATUS.NOT_FOUND);
  assert.equal(resolveStayFromQr(stays, "PF-001-9999").status, QR_EXIT_STATUS.NOT_FOUND);
});

test("QR de cupón, vacío o basura se rechazan con motivo propio", () => {
  assert.equal(resolveStayFromQr(stays, `PFC-COUPON:${TOKEN_A}`).status, QR_EXIT_STATUS.COUPON, "un cupón con uuid nunca se toma como ticket");
  assert.equal(resolveStayFromQr(stays, "").status, QR_EXIT_STATUS.EMPTY);
  assert.equal(resolveStayFromQr(stays, "hola mundo !!").status, QR_EXIT_STATUS.INVALID);
  assert.equal(resolveStayFromQr(null, TOKEN_A).status, QR_EXIT_STATUS.NOT_FOUND);
});

test("dos estadías OPEN con el mismo token -> CONFLICT (no se elige una)", () => {
  const dup = [...stays, { ...stays[0], id: "s3" }];
  const result = resolveStayFromQr(dup, TOKEN_A);
  assert.equal(result.status, QR_EXIT_STATUS.CONFLICT);
  assert.match(qrExitMessage(result), /2 permanencias abiertas/);
});

test("cada estado de error tiene mensaje para el operador", () => {
  for (const status of [QR_EXIT_STATUS.EMPTY, QR_EXIT_STATUS.INVALID, QR_EXIT_STATUS.COUPON, QR_EXIT_STATUS.NOT_FOUND]) {
    assert.ok(qrExitMessage({ status }).length > 10, status);
  }
  assert.equal(qrExitMessage({ status: QR_EXIT_STATUS.FOUND }), "");
});
