import test from "node:test";
import assert from "node:assert/strict";
import { getSafeDestination } from "./loginDestination.mjs";

test("sin next, degrada a la raiz", () => {
  assert.equal(getSafeDestination(null), "/");
  assert.equal(getSafeDestination(undefined), "/");
  assert.equal(getSafeDestination(""), "/");
});

test("respeta un next interno valido", () => {
  assert.equal(getSafeDestination("/data-entry"), "/data-entry");
  assert.equal(getSafeDestination("/dispositivos"), "/dispositivos");
});

test("rechaza destinos externos o protocolo-relativos", () => {
  assert.equal(getSafeDestination("https://otro-dominio.cl"), "/");
  assert.equal(getSafeDestination("//otro-dominio.cl"), "/");
  assert.equal(getSafeDestination("javascript:alert(1)"), "/");
});
