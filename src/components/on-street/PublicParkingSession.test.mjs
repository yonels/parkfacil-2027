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

// --- Cierre del flujo de extensión (auditoría 2026-08-28): el botón de
// extender no depende del SMS, está disponible durante toda la sesión
// ACTIVE, y cada intento de pago usa una idempotency-key nueva. ---

test("el botón EXTENDER ESTADÍA está condicionado únicamente a 'active' (sesión ACTIVE) -- nunca a un estado de SMS", () => {
  assert.match(source, /\{active \? \(\s*<>\s*<button onClick=\{\(\) => setExtend\(!extend\)\}[^}]*>EXTENDER ESTADÍA<\/button>/);
});

test("el componente no referencia SMS ni ningún estado de notificación en absoluto: la extensión nunca depende de si el SMS se envió", () => {
  assert.doesNotMatch(source, /sms/i);
});

test("PAGAR EXTENSIÓN CON WEBPAY no está deshabilitado ni condicionado por ningún flag de SMS/recordatorio -- solo por minutos válidos y 'busy'", () => {
  assert.match(source, /disabled=\{!extra \|\| busy\}/);
});

test("payExtension regenera intentKey/paymentKey en cada intento -- nunca reutiliza la idempotency-key de un intento anterior (§6: nueva transacción por extensión)", () => {
  const body = source.slice(source.indexOf("async function payExtension"), source.indexOf("async function payExtension") + 1600);
  assert.match(body, /intentKey\.current = crypto\.randomUUID\(\);/);
  assert.match(body, /paymentKey\.current = crypto\.randomUUID\(\);/);
  // Deben regenerarse ANTES del primer fetch (extension-intents), no después.
  const regenIndex = body.indexOf("paymentKey.current = crypto.randomUUID();");
  const fetchIndex = body.indexOf("extension-intents");
  assert.ok(regenIndex < fetchIndex && regenIndex >= 0 && fetchIndex >= 0, "las claves deben regenerarse antes de crear el intent");
});

test("el guard 'if (busy) return' sigue protegiendo contra doble envío del mismo click (la regeneración de claves no lo reemplaza)", () => {
  const body = source.slice(source.indexOf("async function payExtension"), source.indexOf("async function payExtension") + 200);
  assert.match(body, /if \(busy\) return;/);
});
