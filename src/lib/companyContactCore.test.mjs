import assert from "node:assert/strict";
import test from "node:test";
import { isValidContactEmail, normalizeChileanMobile, normalizeWebsiteUrl } from "./companyContactCore.mjs";

test("isValidContactEmail: acepta formato válido, rechaza vacío/incompleto", () => {
  assert.equal(isValidContactEmail("info@cliente.cl"), true);
  assert.equal(isValidContactEmail(""), false);
  assert.equal(isValidContactEmail("info@cliente"), false);
  assert.equal(isValidContactEmail("info"), false);
});

test("normalizeChileanMobile: acepta +56 9 XXXXXXXX con o sin separadores y normaliza siempre igual", () => {
  assert.deepEqual(normalizeChileanMobile("+56 9 1234 5678"), { ok: true, value: "+56 9 1234 5678", error: null });
  assert.deepEqual(normalizeChileanMobile("56912345678"), { ok: true, value: "+56 9 1234 5678", error: null });
  assert.deepEqual(normalizeChileanMobile("912345678"), { ok: true, value: "+56 9 1234 5678", error: null });
  assert.deepEqual(normalizeChileanMobile("9-1234-5678"), { ok: true, value: "+56 9 1234 5678", error: null });
});

test("normalizeChileanMobile: rechaza formatos que no son un móvil chileno real", () => {
  assert.equal(normalizeChileanMobile("22345678").ok, false, "fijo (sin 9 inicial) no es móvil");
  assert.equal(normalizeChileanMobile("12345678").ok, false, "9 dígitos pero no empieza con 9");
  assert.equal(normalizeChileanMobile("abc").ok, false);
  assert.equal(normalizeChileanMobile("").ok, false);
});

test("normalizeWebsiteUrl: campo vacío es válido (opcional)", () => {
  assert.deepEqual(normalizeWebsiteUrl(""), { ok: true, value: "", error: null });
  assert.deepEqual(normalizeWebsiteUrl("   "), { ok: true, value: "", error: null });
});

test("normalizeWebsiteUrl: agrega https:// cuando falta protocolo", () => {
  const result = normalizeWebsiteUrl("empresa.cl");
  assert.equal(result.ok, true);
  assert.equal(result.value, "https://empresa.cl");
});

test("normalizeWebsiteUrl: respeta https:// explícito y no lo duplica", () => {
  const result = normalizeWebsiteUrl("https://empresa.cl/contacto");
  assert.equal(result.ok, true);
  assert.equal(result.value, "https://empresa.cl/contacto");
});

test("normalizeWebsiteUrl: rechaza valores que no son una URL real", () => {
  assert.equal(normalizeWebsiteUrl("no es una url").ok, false);
  assert.equal(normalizeWebsiteUrl("http://").ok, false);
});
