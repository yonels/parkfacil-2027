import assert from "node:assert/strict";
import test from "node:test";

import { LOW_LIGHT_LUMINANCE_THRESHOLD, averageLuminance, isLowLight } from "./platePhotoLowLight.mjs";

function solidRgba(r, g, b, count) {
  const pixels = new Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

test("averageLuminance: negro puro da 0, blanco puro da 255", () => {
  assert.equal(averageLuminance(solidRgba(0, 0, 0, 16)), 0);
  assert.equal(averageLuminance(solidRgba(255, 255, 255, 16)), 255);
});

test("averageLuminance: gris intermedio da el luma esperado (Rec. 601)", () => {
  const luminance = averageLuminance(solidRgba(100, 100, 100, 4));
  assert.ok(Math.abs(luminance - 100) < 0.01);
});

test("averageLuminance: entrada vacía/nula nunca lanza, devuelve null", () => {
  assert.equal(averageLuminance(null), null);
  assert.equal(averageLuminance([]), null);
});

test("isLowLight: por debajo del umbral es poca luz, en o por encima no", () => {
  assert.equal(isLowLight(LOW_LIGHT_LUMINANCE_THRESHOLD - 1), true);
  assert.equal(isLowLight(LOW_LIGHT_LUMINANCE_THRESHOLD), false);
  assert.equal(isLowLight(LOW_LIGHT_LUMINANCE_THRESHOLD + 1), false);
});

test("isLowLight: luminancia inválida nunca reporta poca luz (nunca bloquea/alerta sin datos reales)", () => {
  assert.equal(isLowLight(null), false);
  assert.equal(isLowLight(undefined), false);
  assert.equal(isLowLight(NaN), false);
});

test("isLowLight acepta un umbral custom", () => {
  assert.equal(isLowLight(50, 40), false);
  assert.equal(isLowLight(30, 40), true);
});
