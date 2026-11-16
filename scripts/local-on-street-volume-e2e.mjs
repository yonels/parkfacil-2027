/******************************************************************
 * Prueba de volumen local (§21 de la auditoría 2026-08-28, REESCRITA
 * §7 de la corrección "eliminar límite de 1000" 2026-08-28).
 *
 * Este script antes DOCUMENTABA el techo real de plataforma
 * (Supabase/PostgREST max_rows=1000, ver supabase/config.toml) como una
 * limitación conocida: pedir .limit(2000) sobre >1000 filas reales
 * siempre devolvía exactamente 1000, sin importar el .limit() del
 * cliente.
 *
 * Ahora prueba la CORRECCIÓN: listOnStreetSessionsPage/
 * listOnStreetPaymentsPage (onStreetAdminRepository.js) ya NO traen el
 * universo completo a Node -- piden a Postgres exactamente
 * COUNT + .range(offset, offset+pageSize-1) ya filtrado. Cada página
 * pedida (50/100 filas) queda muy por debajo del techo de 1000, así que
 * ese techo de plataforma deja de ser una limitación real para
 * Sesiones/Pagos, sin necesidad de tocar db.max_rows.
 *
 * Reutiliza EXACTAMENTE la misma forma de query que
 * listOnStreetSessionsPage (no la importa -- los repositories tienen
 * "server-only", que no resuelve bajo `node` plano fuera de Next.js;
 * mismo criterio que ya usaba este script con applySortAndPaginate/
 * fetchOnStreetScopedData antes de esta reescritura).
 *
 * Volumen real: el Supabase local de este entorno YA tiene más de 10.500
 * sesiones acumuladas de trabajo previo (12.908 al momento de escribir
 * esto) -- se usan tal cual para probar el total/paginación a esa escala
 * real, sin insertar miles de filas nuevas innecesariamente. Además se
 * inserta un lote marcado (1200 filas, mismo patrón que la versión
 * anterior de este script) para las verificaciones DETERMINISTAS de
 * filtro/orden/página exacta, y se limpia al final.
 *
 * Uso:
 *   node --env-file=.env.local scripts/local-on-street-volume-e2e.mjs
 *
 * Solo contra Supabase LOCAL. Limpia sus propios datos de prueba al final.
 ******************************************************************/
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.match(url || "", /^http:\/\/(127\.0\.0\.1|localhost):54321$/, "Este script solo corre contra Supabase LOCAL");
assert.ok(serviceKey, "SUPABASE_SERVICE_ROLE_KEY requerida");
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const fail = (r) => { if (r.error) throw r.error; return r.data; };
const results = { pass: 0, fail: 0 };
function check(name, cond) { if (cond) { results.pass += 1; console.log(`  ok - ${name}`); } else { results.fail += 1; console.error(`  FAIL - ${name}`); } }

// 0) Volumen real ya presente en el entorno local -- confirma el escenario
// ">1.000 / 10.500+" pedido explícitamente, sin depender de una inserción
// masiva nueva dentro de esta misma corrida.
console.log("[VOLUME-E2E] Confirmando volumen real ya presente en Supabase local…");
const realCount = await db.from("on_street_pilot_sessions").select("id", { count: "exact", head: true });
if (realCount.error) throw realCount.error;
console.log(`[VOLUME-E2E] on_street_pilot_sessions ya tiene ${realCount.count} filas reales en este entorno.`);
check("El entorno local ya supera el escenario de volumen pedido (>10.500 filas reales)", (realCount.count || 0) > 10500);

const ROW_COUNT = 1200; // > max_rows=1000 a propósito, para las verificaciones deterministas de abajo.
const BATCH_SIZE = 500;

const locations = fail(await db.from("on_street_qr_locations").select("id,parking_id").eq("status", "ACTIVE").limit(1));
assert.ok(locations?.length, "LOCAL_ACTIVE_QR_LOCATION_REQUIRED");
const location = locations[0];
const rates = fail(await db.from("parking_rates").select("id,minute_amount").eq("parking_id", location.parking_id).eq("billing_mode", "EFFECTIVE_MINUTE").eq("status", "ACTIVE").limit(1));
const rate = rates?.[0] || fail(await db.from("parking_rates").insert({ parking_id: location.parking_id, name: "E2E Volumen (tarifa de prueba)", billing_mode: "EFFECTIVE_MINUTE", minute_amount: 30, currency: "CLP", status: "ACTIVE", valid_from: new Date(Date.now() - 60_000).toISOString() }).select("id,minute_amount").single());

const marker = `VOLE2E${randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()}`;
console.log(`[VOLUME-E2E] Insertando ${ROW_COUNT} sesiones de prueba marcadas (marcador ${marker})…`);
const now = Date.now();
const insertedIds = [];
const t0 = Date.now();
for (let start = 0; start < ROW_COUNT; start += BATCH_SIZE) {
  const batch = [];
  const end = Math.min(start + BATCH_SIZE, ROW_COUNT);
  for (let i = start; i < end; i += 1) {
    const startedAt = new Date(now - (ROW_COUNT - i) * 60_000);
    const endedAt = new Date(startedAt.getTime() + 15 * 60_000);
    const minutes = 15;
    const amount = Math.round(minutes * Number(rate.minute_amount)) + (i % 37); // variación para que el sort no sea trivial
    batch.push({
      qr_location_id: location.id, parking_id: location.parking_id,
      phone_normalized: `+569${String(10000000 + i).slice(-8)}`,
      license_plate_normalized: `${marker.slice(-3)}${String(i).padStart(5, "0")}`.slice(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, "0"),
      status: "CLOSED", started_at: startedAt.toISOString(), ended_at: endedAt.toISOString(), duration_seconds: 900,
      purchased_minutes: minutes, rate_id: rate.id, rate_per_minute: Number(rate.minute_amount), simulated_amount: amount, amount_paid: amount,
      operational_number: `OS-${marker}-${i}-${randomUUID().slice(0, 8)}`,
    });
  }
  const inserted = fail(await db.from("on_street_pilot_sessions").insert(batch).select("id"));
  insertedIds.push(...inserted.map((r) => r.id));
}
const insertMs = Date.now() - t0;
console.log(`[VOLUME-E2E] ${insertedIds.length} filas insertadas en ${insertMs}ms.`);
check(`Se insertaron las ${ROW_COUNT} filas de prueba`, insertedIds.length === ROW_COUNT);

// Misma forma de query que listOnStreetSessionsPage: COUNT + .range(), NUNCA
// .limit() sobre el universo completo -- reproducida aquí (no importada,
// ver cabecera) exactamente como se construye ahí.
async function pageQuery({ page, pageSize, sortKey = "started_at", ascending = false, parkingId, from, to, plate }) {
  let q = db.from("on_street_pilot_sessions").select("id,operational_number,started_at,amount_paid,license_plate_normalized", { count: "exact" }).eq("parking_id", parkingId);
  if (from) q = q.gte("started_at", from);
  if (to) q = q.lte("started_at", to);
  if (plate) q = q.ilike("license_plate_normalized", `%${plate}%`);
  q = q.order(sortKey, { ascending });
  const offset = (page - 1) * pageSize;
  q = q.range(offset, offset + pageSize - 1);
  const r = await q;
  if (r.error) throw r.error;
  return { rows: r.data, totalRows: r.count || 0 };
}

try {
  const from = new Date(now - (ROW_COUNT + 10) * 60_000).toISOString();
  const to = new Date(now + 60_000).toISOString();
  const pageSize = 100;

  const tQuery = Date.now();
  const p1 = await pageQuery({ page: 1, pageSize, parkingId: location.parking_id, from, to });
  const queryMs = Date.now() - tQuery;
  console.log(`[VOLUME-E2E] Página 1 (pageSize=${pageSize}) respondió en ${queryMs}ms — totalRows=${p1.totalRows}, filas devueltas=${p1.rows.length}.`);

  check("CORREGIDO: el total real (COUNT) refleja las 1.200 filas insertadas, sin el techo de 1000 -- .range() nunca depende de max_rows para el COUNT", p1.totalRows === ROW_COUNT);
  check("Página 1 devuelve exactamente pageSize filas (muy por debajo de max_rows=1000, nunca se acerca al techo)", p1.rows.length === pageSize);
  check("La consulta de una página responde en un tiempo razonable (<3s) incluso con >10.000 filas reales en la tabla", queryMs < 3000);

  const totalPages = Math.ceil(p1.totalRows / pageSize);
  const middlePageNum = Math.max(2, Math.floor(totalPages / 2));
  const pMiddle = await pageQuery({ page: middlePageNum, pageSize, parkingId: location.parking_id, from, to });
  const pLast = await pageQuery({ page: totalPages, pageSize, parkingId: location.parking_id, from, to });
  check("Página intermedia: exactamente pageSize filas, mismo totalRows", pMiddle.rows.length === pageSize && pMiddle.totalRows === ROW_COUNT);
  check("Última página: filas <= pageSize, nunca vacía por error de redondeo", pLast.rows.length > 0 && pLast.rows.length <= pageSize);

  // Ninguna fila se repite/pierde entre página 1, intermedia y última --
  // confirma que .range() está paginando el universo real, no re-sirviendo
  // siempre las mismas primeras filas.
  const ids1 = new Set(p1.rows.map((r) => r.id));
  const idsMid = new Set(pMiddle.rows.map((r) => r.id));
  const idsLast = new Set(pLast.rows.map((r) => r.id));
  check("Página 1 e intermedia no se solapan", [...ids1].every((id) => !idsMid.has(id)));
  check("Intermedia y última no se solapan", [...idsMid].every((id) => !idsLast.has(id)));

  const pSortAsc = await pageQuery({ page: 1, pageSize: 5, sortKey: "started_at", ascending: true, parkingId: location.parking_id, from, to });
  const sortedCheck = pSortAsc.rows.every((r, i, arr) => i === 0 || new Date(arr[i - 1].started_at).getTime() <= new Date(r.started_at).getTime());
  check("Ordenamiento server-side (started_at asc) real, aplicado antes de paginar", sortedCheck);

  const platePrefix = marker.slice(-3);
  const pPlate = await pageQuery({ page: 1, pageSize: 10, parkingId: location.parking_id, from, to, plate: platePrefix });
  check("Filtro de patente combinado con el rango: totalRows > 0 y <= al total del lote marcado", pPlate.totalRows > 0 && pPlate.totalRows <= ROW_COUNT);
  check("Filtro de patente inexistente: totalRows exactamente 0 (no un error, no el universo completo)", (await pageQuery({ page: 1, pageSize: 10, parkingId: location.parking_id, from, to, plate: "ZZZZNOPE" })).totalRows === 0);

  // Excel completo (§5/§8 de la corrección): recorre TODAS las páginas
  // server-side y confirma que la suma de filas recolectadas es
  // EXACTAMENTE totalRows -- nunca 1000, nunca solo la página visible.
  console.log("[VOLUME-E2E] Simulando exportación Excel completa (recorriendo todas las páginas)…");
  const allRows = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const p = await pageQuery({ page, pageSize, parkingId: location.parking_id, from, to });
    allRows.push(...p.rows);
  }
  check(`Exportación completa: ${allRows.length} filas recolectadas paginando server-side, exactamente igual al total real (${ROW_COUNT}), nunca acotado a 1000`, allRows.length === ROW_COUNT);
  check("Exportación completa: ninguna fila duplicada al recorrer todas las páginas", new Set(allRows.map((r) => r.id)).size === ROW_COUNT);
} finally {
  console.log("[VOLUME-E2E] Limpiando datos de prueba…");
  for (let start = 0; start < insertedIds.length; start += BATCH_SIZE) {
    const chunk = insertedIds.slice(start, start + BATCH_SIZE);
    await db.from("on_street_pilot_sessions").delete().in("id", chunk);
  }
  console.log("[VOLUME-E2E] Datos de prueba eliminados.");
}

console.log(`\n=== RESULTADO: ${results.pass} OK / ${results.fail} FALLIDAS ===`);
console.log("Nota: la prueba de escala del ALGORITMO puro (mes/año/rango/timezone) vive en onStreetDashboardCore.test.mjs. La prueba de la RUTA/RBAC vive en onStreetSessionsPaymentsPeriod.test.mjs.");
if (results.fail > 0) process.exit(1);
