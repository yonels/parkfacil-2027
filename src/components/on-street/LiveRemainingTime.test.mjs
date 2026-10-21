import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Sin jsdom/testing-library (ver src/app/estacionar/[qrCode]/page.test.mjs
// para el mismo criterio ya usado en este repo), un componente "use client"
// con hooks no se puede montar ni testear su ciclo de vida directamente con
// node --test. Se verifica por contrato sobre el código fuente: que el
// contador reutiliza remainingSeconds/formatCountdownClock (no reimplementa
// el cálculo), que arranca desde la prop expiresAt (nunca desde un valor
// fijo ni desde purchased_minutes), y que efectivamente tickea cada segundo.

const source = await readFile(new URL("./LiveRemainingTime.js", import.meta.url), "utf8");
const withoutComments = source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");

test("es un componente de cliente", () => {
  assert.match(source, /^"use client";/);
});

test("reutiliza remainingSeconds y formatCountdownClock de onStreetPilot.mjs, no reimplementa el cálculo", () => {
  assert.match(source, /import \{ formatCountdownClock, remainingSeconds \} from "@\/lib\/onStreetPilot\.mjs";/);
});

test("el cálculo parte siempre de la prop expiresAt, nunca de purchasedMinutes", () => {
  assert.match(source, /remainingSeconds\(expiresAt, now\)/);
  assert.doesNotMatch(withoutComments, /purchasedMinutes|purchased_minutes/);
});

test("tickea cada segundo sin depender de un refresco manual", () => {
  assert.match(source, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 1000\)/);
  assert.match(source, /clearInterval\(t\)/, "debe limpiar el intervalo al desmontar");
});
