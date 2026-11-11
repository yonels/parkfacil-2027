// LPR Off Street — Fase 1 (SOL-2026-11-01-001): prueba de punta a punta LOCAL de
// POST /api/lpr/events. Solo corre contra el Supabase local (127.0.0.1) y un
// servidor local (`next dev`). Crea sus propios datos y los borra al terminar.
//
// Uso:  node scripts/local-lpr-fase1-e2e.mjs [http://localhost:3108]

import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";

import { hashClaveGateway } from "../src/lib/lpr/lprCore.mjs";

const BASE = process.argv[2] || "http://localhost:3108";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((linea) => /^[A-Z_]+=/.test(linea))
    .map((linea) => [linea.slice(0, linea.indexOf("=")), linea.slice(linea.indexOf("=") + 1).replace(/^"|"$/g, "")])
);
const URL_DB = env.NEXT_PUBLIC_SUPABASE_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(URL_DB || "")) throw new Error(`Solo Supabase local; .env.local apunta a ${URL_DB}`);
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) throw new Error("Solo un servidor local.");
const CLAVE_DB = env.SUPABASE_SERVICE_ROLE_KEY;

async function rest(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${URL_DB}/rest/v1/${ruta}`, {
    method: metodo,
    headers: { apikey: CLAVE_DB, Authorization: `Bearer ${CLAVE_DB}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  if (!respuesta.ok) throw new Error(`${metodo} ${ruta} → ${respuesta.status} ${texto}`);
  return texto ? JSON.parse(texto) : null;
}

const PARKING = "0ce3215f-b554-4d25-8613-b64f84e145c3"; // «Fase 5 E2E - Clínica Ramis» (local)
const sufijo = randomBytes(3).toString("hex").toUpperCase();
const CLAVE = randomBytes(32).toString("base64url");
const creado = { gateways: [], accesos: [], dispositivos: [], estadias: [] };

function xml(patente, confianza) {
  return `<EventNotificationAlert><channelID>1</channelID><dateTime>${new Date().toISOString()}</dateTime>` +
    `<eventType>ANPR</eventType><ANPR><licensePlate>${patente}</licensePlate><confidenceLevel>${confianza}</confidenceLevel></ANPR></EventNotificationAlert>`;
}

async function enviar(cuerpo, clave = CLAVE) {
  const respuesta = await fetch(`${BASE}/api/lpr/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(clave ? { Authorization: `Bearer ${clave}` } : {}) },
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: await respuesta.json() };
}

const resultados = [];
async function caso(nombre, fn) {
  try {
    await fn();
    resultados.push(`OK  ${nombre}`);
  } catch (error) {
    resultados.push(`ERR ${nombre}: ${error.message}`);
  }
}

try {
  const [gateway] = await rest("POST", "lpr_gateways", { parking_id: PARKING, name: `E2E ${sufijo}`, key_hash: hashClaveGateway(CLAVE) });
  creado.gateways.push(gateway.id);
  const [entrada, salida] = await rest("POST", "lpr_access_points", [
    { parking_id: PARKING, name: `Entrada E2E ${sufijo}`, direction: "IN", exit_grace_minutes: 15 },
    { parking_id: PARKING, name: `Salida E2E ${sufijo}`, direction: "OUT", exit_grace_minutes: 15 },
  ]);
  creado.accesos.push(entrada.id, salida.id);
  const [camaraIn, camaraOut, barrera, camaraOff] = await rest("POST", "lpr_devices", [
    { company_id: "emp-ramis", parking_id: PARKING, access_point_id: entrada.id, gateway_id: gateway.id, type: "LPR_CAMERA", name: `Cam IN ${sufijo}`, enabled: true, health: "OK", config: {} },
    { company_id: "emp-ramis", parking_id: PARKING, access_point_id: salida.id, gateway_id: gateway.id, type: "LPR_CAMERA", name: `Cam OUT ${sufijo}`, enabled: true, health: "OK", config: {} },
    { company_id: "emp-ramis", parking_id: PARKING, access_point_id: salida.id, gateway_id: gateway.id, type: "BARRIER", name: `Barrera ${sufijo}`, enabled: true, health: "OK", config: { pulse_ms: 2000 } },
    { company_id: "emp-ramis", parking_id: PARKING, access_point_id: salida.id, gateway_id: gateway.id, type: "LPR_CAMERA", name: `Cam OFF ${sufijo}`, enabled: false, health: "DISABLED", config: {} },
  ]);
  creado.dispositivos.push(camaraIn.id, camaraOut.id, barrera.id, camaraOff.id);

  // Patentes de prueba únicas: «ZP» + 4 dígitos al azar (formato antiguo AB·1234).
  const digitos = () => String(Math.floor(1000 + Math.random() * 9000));
  const PAGADA = `ZP${digitos()}`;
  const ABIERTA = `ZQ${digitos()}`;
  const VENCIDA = `ZR${digitos()}`;
  const formato = (p) => `${p.slice(0, 4)}-${p.slice(4)}`;
  const hace = (minutos) => new Date(Date.now() - minutos * 60000).toISOString();
  const estadias = await rest("POST", "parking_stays", [
    { code: `E2E-P-${sufijo}`, parking_id: PARKING, license_plate: formato(PAGADA), entry_operator_name: "E2E", entry_at: hace(90), status: "PAID", exit_at: hace(5), payment_code: `E2E-PAY-P-${sufijo}`, total_amount: 1000 },
    { code: `E2E-O-${sufijo}`, parking_id: PARKING, license_plate: formato(ABIERTA), entry_operator_name: "E2E", entry_at: hace(30), status: "OPEN", exit_at: null, payment_code: null, total_amount: null },
    { code: `E2E-V-${sufijo}`, parking_id: PARKING, license_plate: formato(VENCIDA), entry_operator_name: "E2E", entry_at: hace(120), status: "PAID", exit_at: hace(40), payment_code: `E2E-PAY-V-${sufijo}`, total_amount: 1000 },
  ]);
  creado.estadias.push(...estadias.map((e) => e.id));

  await caso("sin clave → 401", async () => {
    assert.equal((await enviar({ deviceId: camaraOut.id, isapiXml: xml(PAGADA, 98) }, null)).status, 401);
  });
  await caso("clave desconocida → 401", async () => {
    assert.equal((await enviar({ deviceId: camaraOut.id, isapiXml: xml(PAGADA, 98) }, randomBytes(32).toString("base64url"))).status, 401);
  });
  await caso("cuerpo inválido → 400", async () => {
    assert.equal((await enviar("no es json")).status, 400);
    assert.equal((await enviar({ deviceId: camaraOut.id })).status, 400);
  });
  await caso("cámara de otro estacionamiento o inexistente → 404", async () => {
    assert.equal((await enviar({ deviceId: randomUUID(), isapiXml: xml(PAGADA, 98) })).status, 404);
  });

  let comandoId = null;
  await caso("salida pagada hace 5 min → OPEN_PAID, orden OPEN pendiente con el pulso de la barrera", async () => {
    const r = await enviar({ deviceId: camaraOut.id, externalId: `e2e-${sufijo}-1`, isapiXml: xml(PAGADA, 98) });
    assert.equal(r.status, 201, JSON.stringify(r.cuerpo));
    assert.equal(r.cuerpo.decision, "OPEN_PAID");
    assert.equal(r.cuerpo.open, true);
    assert.equal(r.cuerpo.plate, formato(PAGADA));
    comandoId = r.cuerpo.commandId;
    const [comando] = await rest("GET", `lpr_barrier_commands?id=eq.${comandoId}&select=action,origin,status,pulse_ms,device_id`);
    assert.deepEqual(comando, { action: "OPEN", origin: "AUTO", status: "PENDING", pulse_ms: 2000, device_id: barrera.id });
    const [estadia] = await rest("GET", `parking_stays?id=eq.${estadias[0].id}&select=gate_exit_at,exit_plate_source`);
    assert.ok(estadia.gate_exit_at);
    assert.equal(estadia.exit_plate_source, "CAMERA");
  });
  await caso("la misma lectura reenviada (externalId) no se duplica → 200 duplicate", async () => {
    const r = await enviar({ deviceId: camaraOut.id, externalId: `e2e-${sufijo}-1`, isapiXml: xml(PAGADA, 98) });
    assert.equal(r.status, 200);
    assert.equal(r.cuerpo.duplicate, true);
    assert.equal(r.cuerpo.commandId, comandoId);
    const eventos = await rest("GET", `lpr_events?device_id=eq.${camaraOut.id}&external_id=eq.e2e-${sufijo}-1&select=id`);
    assert.equal(eventos.length, 1);
  });
  await caso("segunda lectura nueva de la misma salida ya registrada → no abre otra vez", async () => {
    const r = await enviar({ deviceId: camaraOut.id, externalId: `e2e-${sufijo}-2`, isapiXml: xml(PAGADA, 97) });
    assert.equal(r.cuerpo.open, false);
    assert.equal(r.cuerpo.decision, "EXIT_NO_STAY");
  });
  await caso("salida con estadía abierta → EXIT_NOT_PAID, no abre", async () => {
    const r = await enviar({ deviceId: camaraOut.id, isapiXml: xml(ABIERTA, 98) });
    assert.deepEqual([r.cuerpo.decision, r.cuerpo.open, r.cuerpo.stayId], ["EXIT_NOT_PAID", false, estadias[1].id]);
  });
  await caso("salida pagada hace 40 min (plazo 15) → EXIT_GRACE_EXPIRED", async () => {
    const r = await enviar({ deviceId: camaraOut.id, isapiXml: xml(VENCIDA, 98) });
    assert.deepEqual([r.cuerpo.decision, r.cuerpo.open], ["EXIT_GRACE_EXPIRED", false]);
  });
  await caso("«No Plate» y confianza baja → MANUAL_REQUIRED", async () => {
    assert.equal((await enviar({ deviceId: camaraOut.id, isapiXml: xml("No Plate", 0) })).cuerpo.decision, "MANUAL_REQUIRED");
    assert.equal((await enviar({ deviceId: camaraOut.id, isapiXml: xml(PAGADA, 60) })).cuerpo.decision, "MANUAL_REQUIRED");
  });
  await caso("cámara desactivada → DEVICE_DISABLED", async () => {
    assert.equal((await enviar({ deviceId: camaraOff.id, isapiXml: xml(PAGADA, 98) })).cuerpo.decision, "DEVICE_DISABLED");
  });
  await caso("entrada: patente nueva → ENTRY_NEW; con estadía abierta → ENTRY_DUPLICATE", async () => {
    assert.equal((await enviar({ deviceId: camaraIn.id, isapiXml: xml(`ZS${digitos()}`, 98) })).cuerpo.decision, "ENTRY_NEW");
    const r = await enviar({ deviceId: camaraIn.id, reading: { plate: ABIERTA, confidence: 95 } });
    assert.deepEqual([r.cuerpo.decision, r.cuerpo.open], ["ENTRY_DUPLICATE", false]);
  });
  await caso("el equipo local revocado ya no entra → 401", async () => {
    await rest("PATCH", `lpr_gateways?id=eq.${gateway.id}`, { revoked_at: new Date().toISOString() });
    assert.equal((await enviar({ deviceId: camaraOut.id, isapiXml: xml(PAGADA, 98) })).status, 401);
  });
  await caso("latencia registrada: received_at y captured_at en cada lectura", async () => {
    const eventos = await rest("GET", `lpr_events?gateway_id=eq.${gateway.id}&select=captured_at,received_at`);
    assert.ok(eventos.length >= 9);
    for (const evento of eventos) assert.ok(evento.captured_at && evento.received_at);
  });
} finally {
  // Limpieza en orden inverso de dependencias.
  const lista = (ids) => `(${ids.join(",")})`;
  if (creado.dispositivos.length) {
    await rest("DELETE", `lpr_barrier_commands?device_id=in.${lista(creado.dispositivos)}`).catch(() => {});
    await rest("DELETE", `lpr_events?device_id=in.${lista(creado.dispositivos)}`).catch(() => {});
    await rest("DELETE", `lpr_devices?id=in.${lista(creado.dispositivos)}`).catch(() => {});
  }
  // service_role no puede borrar parking_stays: las estadías de prueba quedan
  // anuladas (CANCELLED) para no ocupar la patente. Se reconocen por su code E2E-*.
  if (creado.estadias.length) {
    await rest("PATCH", `parking_stays?id=in.${lista(creado.estadias)}`, { status: "CANCELLED" }).catch((e) => console.error("limpieza estadías:", e.message));
  }
  if (creado.accesos.length) await rest("DELETE", `lpr_access_points?id=in.${lista(creado.accesos)}`).catch(() => {});
  if (creado.gateways.length) await rest("DELETE", `lpr_gateways?id=in.${lista(creado.gateways)}`).catch(() => {});
}

console.log(resultados.join("\n"));
const fallas = resultados.filter((linea) => linea.startsWith("ERR")).length;
console.log(`\n${resultados.length - fallas}/${resultados.length} casos OK`);
process.exitCode = fallas ? 1 : 0;
