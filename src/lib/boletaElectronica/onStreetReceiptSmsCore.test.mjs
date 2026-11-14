import test from "node:test";
import assert from "node:assert/strict";
import { resolveReceiptSmsSiteBaseUrl, buildReceiptSmsLink, buildReceiptSmsMessage } from "./onStreetReceiptSmsCore.mjs";

test("usa PUBLIC_RECEIPTS_SITE_BASE_URL si está configurada, si no el dominio por defecto", () => {
  assert.equal(resolveReceiptSmsSiteBaseUrl({}), "https://www.parkfacil.cl");
  assert.equal(resolveReceiptSmsSiteBaseUrl({ PUBLIC_RECEIPTS_SITE_BASE_URL: "http://localhost:3150/" }), "http://localhost:3150");
});

test("el link apunta a /consulte-su-boleta con la patente como query param", () => {
  const link = buildReceiptSmsLink({ plate: "CXPY-93", baseUrl: "https://www.parkfacil.cl" });
  assert.equal(link, "https://www.parkfacil.cl/consulte-su-boleta?patente=CXPY-93");
});

test("el mensaje queda dentro de los 160 caracteres y sin tildes (evita el aviso NON_GSM_CHARACTERS)", () => {
  const message = buildReceiptSmsMessage({ plate: "CXPY-93", baseUrl: "https://www.parkfacil.cl" });
  assert.ok(message.length <= 160, `largo real: ${message.length}`);
  assert.doesNotMatch(message, /[áéíóúÁÉÍÓÚ]/);
  assert.match(message, /https:\/\/www\.parkfacil\.cl\/consulte-su-boleta\?patente=CXPY-93/);
});
