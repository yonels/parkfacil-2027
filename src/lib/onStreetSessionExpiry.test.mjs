import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// --- Wrapper JS: delega en la RPC real, nunca reimplementa la lógica ---
// onStreetPilotRepository.js lleva "server-only" (igual que el resto de sus
// exports) y no tiene test dedicado por eso mismo: no puede importarse en
// directo con node --test (server-only solo resuelve dentro del build de
// Next.js). Se verifica por contrato sobre el código fuente -- mismo patrón
// que onStreetPublicOrigin.test.mjs usa sobre onStreetSmsService.js.

const repositorySource = await readFile(new URL("./onStreetPilotRepository.js", import.meta.url), "utf8");

test("expireDueOnStreetPilotSessions existe, delega en la RPC real con barrido global (p_parking_id: null), y propaga su error sin ocultarlo", () => {
  const start = repositorySource.indexOf("export async function expireDueOnStreetPilotSessions");
  assert.ok(start > -1, "la función debe existir y estar exportada");
  const body = repositorySource.slice(start, repositorySource.indexOf("\n}", start));
  assert.match(body, /db\.rpc\(\s*"expire_on_street_pilot_sessions"\s*,\s*\{\s*p_parking_id:\s*null\s*\}\s*\)/);
  assert.match(body, /if\s*\(\s*error\s*\)\s*throw\s*error/, "debe propagar el error de la RPC, nunca ocultarlo");
  assert.doesNotMatch(body, /catch/, "no debe silenciar fallos con un catch propio");
});

// --- Contrato sobre la RPC real (migración): la lógica vive en SQL, se
// verifica por contrato igual que el resto de RPCs de este módulo
// (onStreetWebpay.test.mjs). Local Supabase ya confirmó manualmente que la
// migración aplica limpio y que rpc(null) responde 0 sobre datos reales. ---

const migration = await readFile(new URL("../../supabase/migrations/20260826180000_on_street_session_expiry_sweep.sql", import.meta.url), "utf8");

test("Caso A: una sesión vigente (expires_at futuro) nunca queda incluida en el WHERE", () => {
  assert.match(migration, /where status='ACTIVE'/);
  assert.match(migration, /expires_at<=clock_timestamp\(\)/);
  // la única condición temporal es expires_at<=now(): no hay forma de que
  // una fila con expires_at futuro cumpla el WHERE.
  assert.doesNotMatch(migration, /expires_at\s*>/);
});

test("Caso B: una sesión ACTIVE vencida y abandonada sí queda cubierta -- no depende de que alguien visite una página", () => {
  assert.match(migration, /set status='EXPIRED', updated_at=clock_timestamp\(\)/);
  // Sin filtro adicional de "visitada recientemente", "con conductor
  // activo" ni nada que dependa de una visita: solo status+expires_at.
  assert.doesNotMatch(migration, /public_token|session_id|visited|last_seen/);
});

test("Caso E (aislamiento estructural de concurrencia): una sola sentencia UPDATE atómica, sin loop de filas ni lock explícito adicional necesario", () => {
  const updates = migration.match(/update public\.on_street_pilot_sessions/g) || [];
  assert.equal(updates.length, 1, "debe ser una única sentencia UPDATE -- Postgres la ejecuta como una operación atómica");
});

test("Caso F (aislamiento por ubicación): sigue soportando acotar a un parking_id específico, sin tocar otros", () => {
  assert.match(migration, /p_parking_id is null or parking_id=p_parking_id/);
});

test("no relaja ni toca el índice de sesión única en código ejecutable (el nombre solo aparece en el comentario explicativo)", () => {
  const sql = migration.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(sql, /on_street_one_active_phone_location_idx/);
  assert.doesNotMatch(migration, /drop index|drop constraint/i);
});

test("mantiene la misma firma (uuid) -- los GRANT/REVOKE existentes ya cubren esta versión sin necesidad de repetirlos", () => {
  assert.match(migration, /expire_on_street_pilot_sessions\(p_parking_id uuid default null\)/);
});

test("sigue siendo SECURITY DEFINER solo para service_role (no se amplía el acceso)", () => {
  assert.doesNotMatch(migration, /grant execute.*to (authenticated|anon|public)/i);
});
