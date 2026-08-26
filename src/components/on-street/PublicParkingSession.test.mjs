import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Cobertura de regresión (no se modificó este archivo en esta tarea): la
// pantalla de sesión activa ya calculaba "Tiempo restante" a partir de
// s.expiresAt - now, nunca de purchasedMinutes -- se fija por contrato para
// que un cambio futuro no lo rompa silenciosamente. Mismo criterio de
// pruebas sin jsdom que el resto del módulo On-Street.

const source = await readFile(new URL("./PublicParkingSession.js", import.meta.url), "utf8");

test("'Tiempo restante' se calcula con remainingSeconds(s.expiresAt, now), nunca desde purchasedMinutes", () => {
  assert.match(source, /const left = remainingSeconds\(s\.expiresAt, now\);/);
});

test("refresca la sesión desde el servidor (no usa estado del navegador entre cargas)", () => {
  assert.match(source, /fetch\(`\/api\/public\/on-street\/sessions\/\$\{token\}`, \{ cache: "no-store" \}\)/);
});

test("el contador se muestra en 0 cuando la sesión no está activa (vencida/finalizada), nunca un valor negativo", () => {
  assert.match(source, /\{active \? formatDuration\(left\) : "0 s"\}/);
});
