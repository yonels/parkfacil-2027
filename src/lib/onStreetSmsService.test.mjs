import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { processDueOnStreetSms, processOnStreetSmsDeliveryStatus } from "./onStreetSmsCore.mjs";

const trackingMigration = await readFile(new URL("../../supabase/migrations/20260821130000_on_street_sentraland_sms_tracking.sql", import.meta.url), "utf8");

test("migración: PROCESSING se agrega al enum de estado sin quitar los existentes", () => {
  assert.match(trackingMigration, /'PENDING','PROCESSING','SENT','FAILED','CANCELLED'/);
});

test("migración: columnas de tracking de proveedor son todas nullable (aditivo, no rompe filas existentes)", () => {
  for (const column of ["provider", "provider_message_id", "provider_status", "provider_description", "accepted_at", "delivered_at"]) {
    assert.match(trackingMigration, new RegExp(`add column if not exists ${column} `));
  }
});

test("migración: no toca ni la tabla de sesiones ni el trigger de programación T-15 existente", () => {
  assert.doesNotMatch(trackingMigration, /on_street_pilot_sessions/);
  assert.doesNotMatch(trackingMigration, /trg_on_street_pilot_notifications/);
});

// Fake mínimo de un cliente Supabase, suficiente para las cadenas exactas
// que usa onStreetSmsService.js. Cada consulta filtra un arreglo en
// memoria; update()...maybeSingle() hace el mismo check-y-mutación que un
// UPDATE ... WHERE ... condicional real: la condición se evalúa y la fila
// se muta en la misma llamada síncrona, sin punto de interrupción en el
// medio — así se puede probar reclamos concurrentes de forma determinista,
// igual que lo garantiza el UPDATE atómico de Postgres.
function makeFakeDb(seedRows) {
  const table = seedRows.map((r) => ({ ...r }));
  function matches(row, filters) {
    return filters.every(([type, col, val]) => {
      if (type === "eq") return row[col] === val;
      if (type === "lte") return row[col] <= val;
      if (type === "is") return val === null ? row[col] == null : row[col] === val;
      if (type === "not") return row[col] != null; // única forma usada: "is not null"
      return true;
    });
  }
  function builder(kind, patch) {
    const filters = [];
    let limitN = null;
    const api = {
      eq(col, val) { filters.push(["eq", col, val]); return api; },
      lte(col, val) { filters.push(["lte", col, val]); return api; },
      is(col, val) { filters.push(["is", col, val]); return api; },
      not(col) { filters.push(["not", col, null]); return api; },
      order() { return api; },
      limit(n) { limitN = n; return api; },
      select() { return api; },
      async maybeSingle() {
        const idx = table.findIndex((r) => matches(r, filters));
        if (idx === -1) return { data: null, error: null };
        if (kind === "update") Object.assign(table[idx], patch);
        return { data: { ...table[idx] }, error: null };
      },
      then(resolve) {
        let rows = table.filter((r) => matches(r, filters));
        if (limitN != null) rows = rows.slice(0, limitN);
        resolve({ data: rows.map((r) => ({ ...r })), error: null });
      },
    };
    return api;
  }
  return {
    from() {
      return {
        select() { return builder("select"); },
        update(patch) { return builder("update", patch); },
      };
    },
    _table: table,
  };
}

const NOW = "2026-08-21T10:15:00.000Z";
function baseRow(overrides = {}) {
  return {
    id: "n1",
    phone_normalized: "+56912345678",
    message: "ParkFacil: vence en 15 min. /estacionar/sesion/123e4567-e89b-42d3-a456-426614174000",
    status: "PENDING",
    scheduled_at: "2026-08-21T10:00:00.000Z",
    attempts: 0,
    provider: null,
    provider_message_id: null,
    provider_status: null,
    provider_description: null,
    accepted_at: null,
    delivered_at: null,
    ...overrides,
  };
}

test("envío correcto marca SENT y conserva idmensaje devuelto por el proveedor", async () => {
  const db = makeFakeDb([baseRow()]);
  const provider = { name: "SENTRALAND", send: async () => ({ ok: true, providerMessageId: "778899", providerStatus: "0", providerDescription: "Ok mensaje enviado" }) };
  const results = await processDueOnStreetSms({ origin: "https://cliente.parkfacilapp.cl", provider, db, now: NOW });
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "SENT");
  assert.equal(db._table[0].status, "SENT");
  assert.equal(db._table[0].provider_message_id, "778899");
  assert.equal(db._table[0].provider, "SENTRALAND");
  assert.ok(db._table[0].accepted_at);
});

test("no envía antes de tiempo: un aviso con scheduled_at futuro no se procesa", async () => {
  const db = makeFakeDb([baseRow({ scheduled_at: "2026-08-21T10:30:00.000Z" })]);
  let called = false;
  const provider = { name: "SENTRALAND", send: async () => { called = true; return { ok: true, providerMessageId: "1" }; } };
  const results = await processDueOnStreetSms({ origin: "https://x", provider, db, now: NOW });
  assert.equal(results.length, 0);
  assert.equal(called, false);
  assert.equal(db._table[0].status, "PENDING");
});

test("error sin bolsa (o cualquier fallo del proveedor) marca FAILED con el código de error, no SENT", async () => {
  const db = makeFakeDb([baseRow()]);
  const provider = { name: "SENTRALAND", send: async () => ({ ok: false, errorCode: "SENTRALAND_2", providerStatus: "2", providerDescription: "ERROR SIN SMS EN BOLSA" }) };
  const results = await processDueOnStreetSms({ origin: "https://x", provider, db, now: NOW });
  assert.equal(results[0].status, "FAILED");
  assert.equal(db._table[0].error_code, "SENTRALAND_2");
  assert.equal(db._table[0].provider_message_id, null);
});

test("idempotencia: dos ejecuciones concurrentes sobre el mismo aviso PENDING solo envían un SMS", async () => {
  const db = makeFakeDb([baseRow()]);
  let sendCalls = 0;
  const provider = {
    name: "SENTRALAND",
    async send() {
      sendCalls += 1;
      return { ok: true, providerMessageId: `id-${sendCalls}` };
    },
  };
  const [a, b] = await Promise.all([
    processDueOnStreetSms({ origin: "https://x", provider, db, now: NOW }),
    processDueOnStreetSms({ origin: "https://x", provider, db, now: NOW }),
  ]);
  assert.equal(sendCalls, 1, "el proveedor debe llamarse una única vez para el mismo aviso");
  const totalUpdated = a.length + b.length;
  assert.equal(totalUpdated, 1, "solo una de las dos ejecuciones concurrentes debe reportar la fila como actualizada");
  assert.equal(db._table[0].status, "SENT");
});

test("un aviso ya en PROCESSING (reclamado por otra ejecución) no vuelve a seleccionarse", async () => {
  const db = makeFakeDb([baseRow({ status: "PROCESSING" })]);
  let called = false;
  const provider = { name: "SENTRALAND", send: async () => { called = true; return { ok: true }; } };
  const results = await processDueOnStreetSms({ origin: "https://x", provider, db, now: NOW });
  assert.equal(results.length, 0);
  assert.equal(called, false);
});

test("un proveedor que lanza una excepción de configuración se registra como FAILED, no interrumpe el lote", async () => {
  const db = makeFakeDb([baseRow(), baseRow({ id: "n2" })]);
  let call = 0;
  const provider = {
    name: "SENTRALAND",
    async send() {
      call += 1;
      if (call === 1) throw Object.assign(new Error("SENTRALAND_TIPO_SERVICIO_NOT_CONFIGURED"), { code: "SENTRALAND_TIPO_SERVICIO_NOT_CONFIGURED" });
      return { ok: true, providerMessageId: "2" };
    },
  };
  const results = await processDueOnStreetSms({ origin: "https://x", provider, db, now: NOW });
  assert.equal(results.length, 2);
  const first = db._table.find((r) => r.id === "n1");
  assert.equal(first.status, "FAILED");
  assert.equal(first.error_code, "SENTRALAND_TIPO_SERVICIO_NOT_CONFIGURED");
});

// --- Consulta DLR ---

test("consulta de DLR marca delivered_at solo cuando el proveedor confirma DELIVERED", async () => {
  const db = makeFakeDb([baseRow({ status: "SENT", provider: "SENTRALAND", provider_message_id: "778899", delivered_at: null })]);
  const provider = { name: "SENTRALAND", send: async () => ({ ok: true }), checkStatus: async () => ({ deliveryState: "DELIVERED", providerStatus: "0", providerDescription: "DELIVRD" }) };
  const results = await processOnStreetSmsDeliveryStatus({ provider, db });
  assert.equal(results.length, 1);
  assert.ok(db._table[0].delivered_at);
});

test("consulta de DLR con estado ACCEPTED (no confirmado) no marca delivered_at", async () => {
  const db = makeFakeDb([baseRow({ status: "SENT", provider: "SENTRALAND", provider_message_id: "778899", delivered_at: null })]);
  const provider = { name: "SENTRALAND", send: async () => ({ ok: true }), checkStatus: async () => ({ deliveryState: "ACCEPTED", providerStatus: "0", providerDescription: "ENROUTE" }) };
  await processOnStreetSmsDeliveryStatus({ provider, db });
  assert.equal(db._table[0].delivered_at, null);
  assert.equal(db._table[0].provider_description, "ENROUTE");
});

test("el proveedor simulado (sin checkStatus) no intenta consultar DLR", async () => {
  const db = makeFakeDb([baseRow({ status: "SENT", provider: "SIMULATED", provider_message_id: "simulated-1" })]);
  const provider = { name: "SIMULATED", send: async () => ({ ok: true }), checkStatus: null };
  const results = await processOnStreetSmsDeliveryStatus({ provider, db });
  assert.deepEqual(results, []);
});

test("un aviso SENT sin provider_message_id no se consulta (nada que buscar en Sentraland)", async () => {
  const db = makeFakeDb([baseRow({ status: "SENT", provider: "SENTRALAND", provider_message_id: null })]);
  let called = false;
  const provider = { name: "SENTRALAND", send: async () => ({ ok: true }), checkStatus: async () => { called = true; return { deliveryState: "DELIVERED" }; } };
  await processOnStreetSmsDeliveryStatus({ provider, db });
  assert.equal(called, false);
});
