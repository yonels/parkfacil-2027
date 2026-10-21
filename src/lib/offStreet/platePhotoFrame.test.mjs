import assert from "node:assert/strict";
import test from "node:test";

import {
  PLATE_FRAME_ASPECT,
  computePlateCropOutputSize,
  computePlateFrameRect,
} from "./platePhotoFrame.mjs";

// ---- §2 del encargo: proporción 2,77:1 (396x143mm = 360x130mm + 10%) ----

test("PLATE_FRAME_ASPECT es ~2,77:1 (396/143 exacto)", () => {
  assert.ok(Math.abs(PLATE_FRAME_ASPECT - 2.77) < 0.01);
  assert.equal(PLATE_FRAME_ASPECT, 396 / 143);
});

test("computePlateFrameRect: entrada inválida nunca lanza, devuelve null", () => {
  assert.equal(computePlateFrameRect(0, 100), null);
  assert.equal(computePlateFrameRect(100, 0), null);
  assert.equal(computePlateFrameRect(-10, 100), null);
  assert.equal(computePlateFrameRect(NaN, 100), null);
  assert.equal(computePlateFrameRect(undefined, undefined), null);
});

test("computePlateFrameRect: fuente típica de cámara (4:3) -- razón exacta, centrado, sin activar el tope", () => {
  const frame = computePlateFrameRect(1280, 960);
  assert.ok(frame);
  assert.ok(Math.abs(frame.width / frame.height - PLATE_FRAME_ASPECT) < 0.001);
  assert.equal(frame.width, 1280 * 0.88);
  // Centrado exacto en ambos ejes.
  assert.ok(Math.abs(frame.x + frame.width / 2 - 1280 / 2) < 0.001);
  assert.ok(Math.abs(frame.y + frame.height / 2 - 960 / 2) < 0.001);
});

test("computePlateFrameRect: fuente en vertical (retrato) -- misma razón, nunca se deforma", () => {
  const frame = computePlateFrameRect(720, 1280);
  assert.ok(frame);
  assert.ok(Math.abs(frame.width / frame.height - PLATE_FRAME_ASPECT) < 0.001);
  assert.ok(frame.width <= 720);
  assert.ok(frame.height <= 1280);
});

test("computePlateFrameRect: fuente con razón de aspecto extrema (mucho más ancha que alta) activa el tope de alto sin deformar", () => {
  const frame = computePlateFrameRect(2000, 500);
  assert.ok(frame);
  // El 88% de ancho (1760) excedería el 70% de alto (350) manteniendo la
  // razón -- el tope debe recalcular el ANCHO a partir del alto tope, no
  // cambiar la razón.
  assert.equal(frame.height, 500 * 0.7);
  assert.ok(Math.abs(frame.width / frame.height - PLATE_FRAME_ASPECT) < 0.001);
  assert.ok(frame.width < 2000 * 0.88);
});

test("computePlateFrameRect: el marco nunca excede las dimensiones de la fuente", () => {
  for (const [w, h] of [[1280, 960], [1920, 1080], [720, 1280], [4000, 3000], [300, 300]]) {
    const frame = computePlateFrameRect(w, h);
    assert.ok(frame.width <= w + 0.001);
    assert.ok(frame.height <= h + 0.001);
    assert.ok(frame.x >= -0.001);
    assert.ok(frame.y >= -0.001);
  }
});

// ---- §6/§16.4 del encargo: tamaño de salida, nunca deforma, nunca agranda ----

test("computePlateCropOutputSize: si el marco ya es más chico que el máximo, no lo agranda", () => {
  const frame = { width: 300, height: 108.3 };
  const size = computePlateCropOutputSize(frame, 900);
  assert.equal(size.width, 300);
  assert.equal(size.height, 108);
});

test("computePlateCropOutputSize: si excede el máximo, achica ambos ejes por el MISMO factor (nunca deforma)", () => {
  const frame = computePlateFrameRect(4000, 3000);
  const size = computePlateCropOutputSize(frame, 900);
  assert.equal(size.width, 900);
  const expectedHeight = Math.round(frame.height * (900 / frame.width));
  assert.equal(size.height, expectedHeight);
  assert.ok(Math.abs(size.width / size.height - PLATE_FRAME_ASPECT) < 0.02);
});

test("computePlateCropOutputSize: entrada inválida nunca lanza", () => {
  assert.equal(computePlateCropOutputSize(null, 900), null);
  assert.equal(computePlateCropOutputSize({ width: 100, height: 40 }, 0), null);
});
