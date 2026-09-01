import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./InspectorResultado.js", import.meta.url), "utf8");

test("los 4 estados usan la franja de color aprobada: verde/rojo/naranja/gris", () => {
  assert.match(source, /\[INSPECTOR_PLATE_STATUS\.VIGENTE\]: \{ bg: "bg-emerald-600"/);
  assert.match(source, /\[INSPECTOR_PLATE_STATUS\.VENCIDO\]: \{ bg: "bg-rose-600"/);
  assert.match(source, /\[INSPECTOR_PLATE_STATUS\.OBSERVADO\]: \{ bg: "bg-amber-500"/);
  assert.match(source, /\[INSPECTOR_PLATE_STATUS\.SIN_SESION\]: \{ bg: "bg-slate-500"/);
});

test("VIGENTE muestra VER EN MAPA y NUEVA CONSULTA, nunca FISCALIZAR", () => {
  const start = source.indexOf("result.status === INSPECTOR_PLATE_STATUS.VIGENTE ? (");
  const end = source.indexOf(") : result.status === INSPECTOR_PLATE_STATUS.VENCIDO");
  const block = source.slice(start, end);
  assert.match(block, /VER EN MAPA/);
  assert.match(block, /NUEVA CONSULTA/);
  assert.doesNotMatch(block, /FISCALIZAR/);
});

test("VENCIDO muestra FISCALIZAR como botón principal y el tiempo vencido, no el tiempo restante", () => {
  const start = source.indexOf("result.status === INSPECTOR_PLATE_STATUS.VENCIDO ? (");
  const end = source.indexOf(") : result.status === INSPECTOR_PLATE_STATUS.OBSERVADO");
  const block = source.slice(start, end);
  assert.match(block, />FISCALIZAR</);
  assert.match(block, /Tiempo vencido/);
  assert.match(block, /overdue/);
});

test("OBSERVADO muestra motivo, último evento e historial, pero es solo informativo -- nunca ofrece FISCALIZAR (nada vigente/vencido que accionar ahora)", () => {
  const start = source.indexOf("result.status === INSPECTOR_PLATE_STATUS.OBSERVADO ? (");
  const end = source.lastIndexOf(") : (");
  const block = source.slice(start, end);
  assert.match(block, /Motivo/);
  assert.match(block, /Último evento/);
  assert.match(block, /Historial básico/);
  assert.doesNotMatch(block, />FISCALIZAR</);
  assert.match(block, />NUEVA CONSULTA</);
});

test("SIN_SESION muestra el texto exacto del enunciado y solo NUEVA CONSULTA, nunca FISCALIZAR ni VER EN MAPA", () => {
  const block = source.slice(source.lastIndexOf(") : ("));
  assert.match(block, /No existe una sesión de estacionamiento vigente para esta patente\./);
  assert.match(block, />NUEVA CONSULTA</);
  assert.doesNotMatch(block, /FISCALIZAR|VER EN MAPA/);
});

test("nunca muestra un estado interno técnico (ABORTED, PAYMENT_FAILED, etc.) visible al inspector", () => {
  const withoutComments = source.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(withoutComments, /ABORTED|PAYMENT_FAILED|COMMITTING|REDIRECTED/);
});
