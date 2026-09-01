import test from "node:test";
import assert from "node:assert/strict";
import { align, blank, bold, concatBytes, cut, feed, init, size, text } from "./escposCore.mjs";

test("init(): ESC @ (2 bytes) -- inicializa la impresora, igual que escpos.js del agente de PC", () => {
  assert.deepEqual([...init()], [0x1b, 0x40]);
});

test("align(): ESC a n -- 0 izquierda, 1 centro, 2 derecha", () => {
  assert.deepEqual([...align(0)], [0x1b, 0x61, 0]);
  assert.deepEqual([...align(1)], [0x1b, 0x61, 1]);
  assert.deepEqual([...align(2)], [0x1b, 0x61, 2]);
});

test("bold(): ESC E n -- on/off", () => {
  assert.deepEqual([...bold(true)], [0x1b, 0x45, 1]);
  assert.deepEqual([...bold(false)], [0x1b, 0x45, 0]);
});

test("size(): GS ! n -- misma fórmula que escpos.js: (((width-1)&0xf)<<4)|((height-1)&0xf)", () => {
  assert.deepEqual([...size(1, 1)], [0x1d, 0x21, 0x00], "tamaño normal");
  assert.deepEqual([...size(1, 2)], [0x1d, 0x21, 0x01], "solo doble alto");
  assert.deepEqual([...size(2, 1)], [0x1d, 0x21, 0x10], "solo doble ancho");
  assert.deepEqual([...size(2, 2)], [0x1d, 0x21, 0x11], "doble ancho y alto");
});

test("text(): codifica en latin1 (byte-a-byte, sin tabla CP850) y agrega salto de línea -- Á/É/Í/Ó/Ú/Ñ caen 1:1 en su code point Unicode", () => {
  assert.deepEqual([...text("HOLA")], [0x48, 0x4f, 0x4c, 0x41, 0x0a]);
  const accented = text("CORTESÍA");
  assert.equal(accented[accented.length - 3], 0xcd, "Í en latin1 es 0xCD (=Unicode U+00CD), sin tabla de conversión -- 'CORTESÍA\\n': Í es el antepenúltimo byte (penúltimo es 'A', último es '\\n')");
  assert.equal(accented.at(-1), 0x0a);
});

test("blank(): N saltos de línea", () => {
  assert.deepEqual([...blank(2)], [0x0a, 0x0a]);
  assert.deepEqual([...blank(0)], []);
});

test("feed(): ESC d n -- avanza n líneas", () => {
  assert.deepEqual([...feed(3)], [0x1b, 0x64, 3]);
});

test("cut(): GS V 0 -- corte total, igual que escpos.js", () => {
  assert.deepEqual([...cut()], [0x1d, 0x56, 0x00]);
});

test("concatBytes(): une varios Uint8Array en uno solo, en orden, sin perder ni duplicar bytes", () => {
  const result = concatBytes([init(), align(1), text("X")]);
  assert.deepEqual([...result], [0x1b, 0x40, 0x1b, 0x61, 1, 0x58, 0x0a]);
});
