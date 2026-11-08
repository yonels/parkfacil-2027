import test from "node:test";
import assert from "node:assert/strict";
import { isValidRut, rutCheckDigit } from "./rutCore.mjs";

test("dígito verificador del RUT (módulo 11)", () => {
  assert.equal(rutCheckDigit("77991619"), "7");
  assert.equal(rutCheckDigit("76795561"), "8");
  assert.equal(rutCheckDigit("13744807"), "6");
  assert.equal(isValidRut("77.991.619-7"), true);
  assert.equal(isValidRut("76795561-8"), true);
  assert.equal(isValidRut("13744807-9"), false);
  assert.equal(isValidRut("13.744.807-6"), true);
  assert.equal(isValidRut(""), false);
  assert.equal(isValidRut("0-0"), false);
  assert.equal(isValidRut("abc"), false);
});

test("dígito K en minúscula o mayúscula", () => {
  const body = Array.from({ length: 2000 }, (_, i) => String(10000000 + i)).find((b) => rutCheckDigit(b) === "K");
  assert.equal(isValidRut(`${body}-k`), true);
  assert.equal(isValidRut(`${body}-K`), true);
});
