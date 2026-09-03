import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// inspectorInspectionService.js tiene "server-only" (no puede importarse
// directamente con node --test, mismo criterio que el resto del módulo
// server-only de este repo). sendInspectionSmsIfNeeded es la pieza más
// crítica de idempotencia (§12): se extrae y ejecuta de verdad con
// `new Function`, inyectando un `db`/`provider` en memoria -- mismo patrón
// que onStreetSmsSimulatedE2E.test.mjs.

const source = await readFile(new URL("./inspectorInspectionService.js", import.meta.url), "utf8");

const start = source.indexOf("export async function sendInspectionSmsIfNeeded");
const end = source.indexOf("\n}", start) + 2;
const fnSrc = source.slice(start, end).replace("export async function sendInspectionSmsIfNeeded", "async function sendInspectionSmsIfNeeded");
// `new Function` no cierra sobre el scope léxico del módulo (a diferencia de
// un closure normal) -- INSPECTION_OVERDUE_SMS_TEXT debe inyectarse como
// parámetro, igual que NOT_COMPLETED_MESSAGE en el comprobante On-Street.
const INSPECTION_OVERDUE_SMS_TEXT = "ParkFacil: Su tiempo de estacionamiento ha vencido. Su patente será multada.";
const sendInspectionSmsIfNeeded = new Function("INSPECTION_OVERDUE_SMS_TEXT", `return (${fnSrc});`)(INSPECTION_OVERDUE_SMS_TEXT);

// Mismo patrón para getInspectorPhone + sendInspectorCopySmsIfNeeded
// (2026-09-03, "decouple printing + sms copy") -- se extraen JUNTAS porque
// sendInspectorCopySmsIfNeeded llama a getInspectorPhone por su nombre
// (closure de función normal dentro del módulo, no de `new Function`).
// buildInspectorCopySmsText se inyecta igual que INSPECTION_OVERDUE_SMS_TEXT
// arriba -- no se re-implementa, se prueba de verdad en
// inspectorCopySms.test.mjs.
function extractFn(name) {
  const s = source.indexOf(`async function ${name}`);
  const e = source.indexOf("\n}", s) + 2;
  return source.slice(s, e);
}
const buildInspectorCopySmsText = ({ plate, sentAtIso }) => `COPIA INSPECTOR - Fiscalizacion patente ${String(plate || "").toUpperCase()}. Aviso SMS enviado al conductor el ${sentAtIso}.`;
const copySmsFnsSrc = `${extractFn("getInspectorPhone")}\n${extractFn("sendInspectorCopySmsIfNeeded").replace("export async function sendInspectorCopySmsIfNeeded", "async function sendInspectorCopySmsIfNeeded")}\nreturn { getInspectorPhone, sendInspectorCopySmsIfNeeded };`;
const { sendInspectorCopySmsIfNeeded } = new Function("buildInspectorCopySmsText", copySmsFnsSrc)(buildInspectorCopySmsText);

// Mock mínimo de auth.admin.getUserById -- expone user_metadata.phone (o su
// ausencia) igual que el cliente admin real de Supabase.
function authDb(usersByid) {
  return { auth: { admin: { async getUserById(id) {
    const user = usersByid[id];
    if (!user) return { data: { user: null }, error: { message: "not found" } };
    return { data: { user }, error: null };
  } } } };
}

// Mismo memoryDb minimalista que onStreetSmsSimulatedE2E.test.mjs: soporta
// exactamente lo que usa el "claim" -- update/eq/eq/select/maybeSingle,
// aplicando el patch SOLO si la fila coincide con TODOS los filtros
// (incluido sms_status='PENDING') -- eso es lo que modela el reclamo
// atómico condicional real de Postgres.
function memoryDb(rows) {
  const table = rows.map((r) => ({ ...r }));
  return {
    from(name) {
      assert.equal(name, "on_street_inspections");
      const filters = []; let patch = null;
      const api = {
        update(values) { patch = values; return api; },
        eq(key, value) { filters.push((row) => row[key] === value); return api; },
        select() { return api; },
        async maybeSingle() {
          const row = table.find((item) => filters.every((f) => f(item)));
          if (!row) return { data: null, error: null };
          if (patch) Object.assign(row, patch);
          return { data: { ...row }, error: null };
        },
      };
      return api;
    },
    table,
  };
}

test("envía exactamente un SMS con el texto exacto aprobado, y actualiza a SENT con el providerMessageId", async () => {
  const db = memoryDb([{ id: "insp-1", sms_status: "PENDING" }]);
  const sent = [];
  const provider = { async send(payload) { sent.push(payload); return { ok: true, providerMessageId: "prov-123" }; } };
  const result = await sendInspectionSmsIfNeeded(db, { inspectionId: "insp-1", phoneNormalized: "+56911112222", provider });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "+56911112222");
  assert.equal(sent[0].message, INSPECTION_OVERDUE_SMS_TEXT);
  assert.equal(result.sent, true);
  assert.equal(db.table[0].sms_status, "SENT");
  assert.equal(db.table[0].sms_provider_message_id, "prov-123");
});

// --- Corrección 2026-08-31: la pantalla de éxito debe distinguir SIMULATED de un envío real ---

test("sendInspectionSmsIfNeeded devuelve providerName con el nombre real del proveedor resuelto -- necesario para que la UI distinga SIMULATED de un envío real", async () => {
  const db = memoryDb([{ id: "insp-1", sms_status: "PENDING" }]);
  const provider = { name: "SIMULATED", async send() { return { ok: true, providerMessageId: "simulated-abc" }; } };
  const result = await sendInspectionSmsIfNeeded(db, { inspectionId: "insp-1", phoneNormalized: "+56911112222", provider });
  assert.equal(result.providerName, "SIMULATED");
});

test("sendInspectionSmsIfNeeded con el proveedor real (SENTRALAND) también propaga providerName", async () => {
  const db = memoryDb([{ id: "insp-1", sms_status: "PENDING" }]);
  const provider = { name: "SENTRALAND", async send() { return { ok: true, providerMessageId: "778899" }; } };
  const result = await sendInspectionSmsIfNeeded(db, { inspectionId: "insp-1", phoneNormalized: "+56911112222", provider });
  assert.equal(result.providerName, "SENTRALAND");
});

test("REQUISITO CRÍTICO §12: dos llamadas sobre la misma fiscalización nunca envían dos SMS -- solo la que gana el reclamo PENDING->SENDING lo hace", async () => {
  const db = memoryDb([{ id: "insp-1", sms_status: "PENDING" }]);
  const sent = [];
  const provider = { async send(payload) { sent.push(payload); return { ok: true, providerMessageId: "prov-1" }; } };
  const [first, second] = await Promise.all([
    sendInspectionSmsIfNeeded(db, { inspectionId: "insp-1", phoneNormalized: "+56911112222", provider }),
    sendInspectionSmsIfNeeded(db, { inspectionId: "insp-1", phoneNormalized: "+56911112222", provider }),
  ]);
  assert.equal(sent.length, 1, "un doble intento concurrente nunca debe producir dos envíos reales");
  const attempted = [first.attempted, second.attempted];
  assert.deepEqual(attempted.sort(), [false, true], "exactamente una de las dos llamadas debe ganar el reclamo");
});

test("una fiscalización cuyo sms_status ya no es PENDING (SENT/FAILED/NOT_REQUIRED) nunca reintenta el envío", async () => {
  for (const status of ["SENT", "FAILED", "NOT_REQUIRED", "SENDING"]) {
    const db = memoryDb([{ id: "insp-1", sms_status: status }]);
    const sent = [];
    const provider = { async send(payload) { sent.push(payload); return { ok: true }; } };
    const result = await sendInspectionSmsIfNeeded(db, { inspectionId: "insp-1", phoneNormalized: "+56911112222", provider });
    assert.equal(sent.length, 0, status);
    assert.equal(result.attempted, false, status);
  }
});

test("fallo del proveedor SMS nunca se registra como SENT -- nunca se inventa un envío exitoso", async () => {
  const db = memoryDb([{ id: "insp-1", sms_status: "PENDING" }]);
  const provider = { async send() { return { ok: false, errorCode: "SENTRALAND_500" }; } };
  const result = await sendInspectionSmsIfNeeded(db, { inspectionId: "insp-1", phoneNormalized: "+56911112222", provider });
  assert.equal(result.sent, false);
  assert.equal(db.table[0].sms_status, "FAILED");
  assert.equal(db.table[0].sms_provider_message_id, undefined);
});

test("una excepción del proveedor tampoco se registra como SENT (se captura y trata como fallo)", async () => {
  const db = memoryDb([{ id: "insp-1", sms_status: "PENDING" }]);
  const provider = { async send() { throw Object.assign(new Error("timeout"), { code: "PROVIDER_TIMEOUT" }); } };
  const result = await sendInspectionSmsIfNeeded(db, { inspectionId: "insp-1", phoneNormalized: "+56911112222", provider });
  assert.equal(result.sent, false);
  assert.equal(db.table[0].sms_status, "FAILED");
});

// --- Contrato general del módulo ---

test("el texto del SMS es exactamente la constante aprobada, nunca una plantilla armada ad hoc", () => {
  assert.match(source, /import \{ INSPECTION_OVERDUE_SMS_TEXT \} from "\.\/inspectorSms\.mjs";/);
  assert.match(source, /message: INSPECTION_OVERDUE_SMS_TEXT/);
});

test("nunca acepta un teléfono manual del inspector -- registerOnStreetInspection solo usa session.phone_normalized, re-derivado en el servidor", () => {
  const withoutComments = source.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(withoutComments, /body\.phone|input\.phone|params\.phone/i);
  assert.match(source, /session\.phone_normalized/);
});

test("una fiscalización OVERSTAY exige sessionId; re-verifica EXPIRED y la misma patente antes de registrar, nunca confía en el cliente", () => {
  assert.match(source, /if \(!sessionId\) throw error\("INSPECTION_SESSION_REQUIRED", 409\);/);
  assert.match(source, /session\.status !== "EXPIRED"/);
  assert.match(source, /session\.license_plate_normalized !== plate/);
});

test("el SMS solo se intenta cuando el registro fue nuevo (no reused) y realmente lo requiere -- misma condición exacta que antes de la corrección de 'SMS simulado'", () => {
  assert.match(source, /if \(!inspection\.reused && inspection\.smsRequired && session\?\.phone_normalized\)/);
});

test("registerOnStreetInspection propaga smsStatus/smsProvider REALES (post-envío) al objeto devuelto al cliente -- ya no se queda con el smsStatus previo de register_on_street_inspection, que la UI mostraba como 'enviado' incluso en SIMULATED", () => {
  assert.match(source, /const smsResult = await sendInspectionSmsIfNeeded\(db, \{ inspectionId: inspection\.id, phoneNormalized: session\.phone_normalized \}\);/);
  assert.match(source, /if \(smsResult\.attempted\) \{\s*\n\s*inspection\.smsStatus = smsResult\.sms_status;\s*\n\s*inspection\.smsProvider = smsResult\.providerName;\s*\n\s*inspection\.smsProviderMessageId = smsResult\.sms_provider_message_id \?\? null;/);
});

// --- 2026-09-03, "decouple printing + sms copy": sendInspectorCopySmsIfNeeded ---

test("sin teléfono configurado en user_metadata: 'no configurada', nunca un error, nunca intenta enviar", async () => {
  const db = authDb({ "insp-1": { user_metadata: {} } });
  const sent = [];
  const provider = { name: "SIMULATED", async send(p) { sent.push(p); return { ok: true, providerMessageId: "x" }; } };
  const result = await sendInspectorCopySmsIfNeeded(db, { inspectorUserId: "insp-1", plate: "ABC123", sentAtIso: "2026-09-03T00:00:00Z", provider });
  assert.deepEqual(result, { attempted: false, phoneConfigured: false });
  assert.equal(sent.length, 0);
});

test("con teléfono configurado: envía la copia con el mensaje operativo (no el texto legal del conductor) al teléfono del inspector", async () => {
  const db = authDb({ "insp-1": { user_metadata: { phone: "+56900000099" } } });
  const sent = [];
  const provider = { name: "SIMULATED", async send(p) { sent.push(p); return { ok: true, providerMessageId: "copy-1" }; } };
  const result = await sendInspectorCopySmsIfNeeded(db, { inspectorUserId: "insp-1", plate: "abc123", sentAtIso: "2026-09-03T00:00:00Z", provider });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "+56900000099");
  assert.match(sent[0].message, /^COPIA INSPECTOR/);
  assert.match(sent[0].message, /ABC123/);
  assert.doesNotMatch(sent[0].message, /multada/i, "nunca reutiliza el texto legal del SMS al conductor");
  assert.deepEqual(result, { attempted: true, phoneConfigured: true, sent: true, providerName: "SIMULATED", providerMessageId: "copy-1" });
});

test("fallo del proveedor en la copia: se reporta como error, nunca lanza", async () => {
  const db = authDb({ "insp-1": { user_metadata: { phone: "+56900000099" } } });
  const provider = { name: "SIMULATED", async send() { return { ok: false, errorCode: "PROVIDER_DOWN" }; } };
  const result = await sendInspectorCopySmsIfNeeded(db, { inspectorUserId: "insp-1", plate: "ABC123", sentAtIso: "2026-09-03T00:00:00Z", provider });
  assert.equal(result.attempted, true);
  assert.equal(result.sent, false);
});

test("una excepción del proveedor en la copia tampoco se propaga -- se captura y se reporta como no enviada", async () => {
  const db = authDb({ "insp-1": { user_metadata: { phone: "+56900000099" } } });
  const provider = { name: "SIMULATED", async send() { throw new Error("timeout"); } };
  const result = await sendInspectorCopySmsIfNeeded(db, { inspectorUserId: "insp-1", plate: "ABC123", sentAtIso: "2026-09-03T00:00:00Z", provider });
  assert.equal(result.sent, false);
});

// --- Contrato de integración: la copia solo se intenta si el SMS al conductor se envió ---

test("registerOnStreetInspection solo intenta la copia al inspector cuando el SMS al conductor realmente se envió (smsResult.sent), nunca si falló", () => {
  assert.match(source, /if \(smsResult\.attempted && smsResult\.sent\) \{\s*\n\s*inspection\.inspectorCopySms = await sendInspectorCopySmsIfNeeded/);
});

test("un fallo o ausencia de la copia al inspector nunca revierte, duplica ni vuelve a tocar la fiscalización ya registrada (no hay ningún throw/rollback alrededor de sendInspectorCopySmsIfNeeded)", () => {
  const s = source.indexOf("sendInspectorCopySmsIfNeeded(db, {");
  const block = source.slice(s, source.indexOf("\n  }", s));
  assert.doesNotMatch(block, /throw|rollback|delete\(/i);
});

test("nunca importa ni llama a createTransaction/Webpay/reconciliador -- Etapa 2 de Inspectores no toca pagos", () => {
  for (const forbidden of ["Webpay", "createTransaction", "reconcile", "payment_transactions"]) {
    assert.doesNotMatch(source, new RegExp(forbidden, "i"), forbidden);
  }
});
