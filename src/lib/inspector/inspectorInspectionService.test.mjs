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

// Mismo patrón para getInspectorPhone + persistInspectorCopySmsStatus +
// sendInspectorCopySmsIfNeeded (2026-09-03, "decouple printing + sms copy" /
// "persist inspector sms copy trace") -- se extraen JUNTAS porque
// sendInspectorCopySmsIfNeeded llama a las otras dos por su nombre (closure
// de función normal dentro del módulo, no de `new Function`).
// buildInspectorCopySmsText se inyecta igual que INSPECTION_OVERDUE_SMS_TEXT
// arriba -- no se re-implementa, se prueba de verdad en
// inspectorCopySms.test.mjs.
function extractFn(name) {
  const s = source.indexOf(`async function ${name}`);
  const e = source.indexOf("\n}", s) + 2;
  return source.slice(s, e);
}
const buildInspectorCopySmsText = ({ plate, sentAtIso }) => `COPIA INSPECTOR - Fiscalizacion patente ${String(plate || "").toUpperCase()}. Aviso SMS enviado al conductor el ${sentAtIso}.`;
const copySmsFnsSrc = `${extractFn("getInspectorPhone")}\n${extractFn("persistInspectorCopySmsStatus")}\n${extractFn("sendInspectorCopySmsIfNeeded").replace("export async function sendInspectorCopySmsIfNeeded", "async function sendInspectorCopySmsIfNeeded")}\nreturn { getInspectorPhone, persistInspectorCopySmsStatus, sendInspectorCopySmsIfNeeded };`;
const { sendInspectorCopySmsIfNeeded } = new Function("buildInspectorCopySmsText", "console", copySmsFnsSrc)(buildInspectorCopySmsText, { error() {} });

// Mock de auth.admin.getUserById + from("on_street_inspections").update(...)
// -- expone user_metadata.phone (o su ausencia) igual que el cliente admin
// real, y registra cada UPDATE aplicado sobre la fila en memoria (mismo
// criterio que memoryDb más abajo, pero sin el reclamo condicional
// PENDING->SENDING: sendInspectorCopySmsIfNeeded hace un UPDATE simple, no
// un reclamo atómico -- ver informe de por qué eso es correcto aquí).
function authDb(usersByid, inspectionsById = {}) {
  return {
    auth: { admin: { async getUserById(id) {
      const user = usersByid[id];
      if (!user) return { data: { user: null }, error: { message: "not found" } };
      return { data: { user }, error: null };
    } } },
    from(name) {
      assert.equal(name, "on_street_inspections");
      let patch = null; const filters = [];
      const api = {
        update(values) { patch = values; return api; },
        eq(key, value) { filters.push([key, value]); return api; },
        async then(resolve) {
          const id = filters.find(([k]) => k === "id")?.[1];
          if (id != null && inspectionsById[id]) Object.assign(inspectionsById[id], patch);
          resolve({ error: null });
        },
      };
      return api;
    },
    inspectionsById,
  };
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

test("sin teléfono configurado en user_metadata: 'no configurada', nunca un error, nunca intenta enviar -- y persiste NOT_CONFIGURED (2026-09-03, TAREA 8 CASO B)", async () => {
  const inspections = { "qa-1": {} };
  const db = authDb({ "insp-1": { user_metadata: {} } }, inspections);
  const sent = [];
  const provider = { name: "SIMULATED", async send(p) { sent.push(p); return { ok: true, providerMessageId: "x" }; } };
  const result = await sendInspectorCopySmsIfNeeded(db, { inspectionId: "qa-1", inspectorUserId: "insp-1", plate: "ABC123", sentAtIso: "2026-09-03T00:00:00Z", provider });
  assert.deepEqual(result, { attempted: false, phoneConfigured: false });
  assert.equal(sent.length, 0);
  assert.deepEqual(
    { status: inspections["qa-1"].inspector_copy_sms_status, sentAt: inspections["qa-1"].inspector_copy_sms_sent_at, msgId: inspections["qa-1"].inspector_copy_sms_provider_message_id },
    { status: "NOT_CONFIGURED", sentAt: null, msgId: null },
  );
});

test("con teléfono configurado: envía la copia con el mensaje operativo (no el texto legal del conductor) al teléfono del inspector, y persiste SENT (2026-09-03, TAREA 8 CASO A)", async () => {
  const inspections = { "qa-1": {} };
  const db = authDb({ "insp-1": { user_metadata: { phone: "+56900000099" } } }, inspections);
  const sent = [];
  const provider = { name: "SIMULATED", async send(p) { sent.push(p); return { ok: true, providerMessageId: "copy-1" }; } };
  const result = await sendInspectorCopySmsIfNeeded(db, { inspectionId: "qa-1", inspectorUserId: "insp-1", plate: "abc123", sentAtIso: "2026-09-03T00:00:00Z", provider });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "+56900000099");
  assert.match(sent[0].message, /^COPIA INSPECTOR/);
  assert.match(sent[0].message, /ABC123/);
  assert.doesNotMatch(sent[0].message, /multada/i, "nunca reutiliza el texto legal del SMS al conductor");
  assert.deepEqual(result, { attempted: true, phoneConfigured: true, sent: true, providerName: "SIMULATED", providerMessageId: "copy-1" });
  assert.equal(inspections["qa-1"].inspector_copy_sms_status, "SENT");
  assert.equal(inspections["qa-1"].inspector_copy_sms_provider_message_id, "copy-1");
  assert.ok(inspections["qa-1"].inspector_copy_sms_sent_at, "sent_at debe quedar poblado en un envío exitoso");
});

test("fallo del proveedor en la copia: se reporta como error, nunca lanza, y persiste FAILED con sent_at/provider_message_id en null (2026-09-03, TAREA 8 CASO C)", async () => {
  const inspections = { "qa-1": {} };
  const db = authDb({ "insp-1": { user_metadata: { phone: "+56900000099" } } }, inspections);
  const provider = { name: "SIMULATED", async send() { return { ok: false, errorCode: "PROVIDER_DOWN" }; } };
  const result = await sendInspectorCopySmsIfNeeded(db, { inspectionId: "qa-1", inspectorUserId: "insp-1", plate: "ABC123", sentAtIso: "2026-09-03T00:00:00Z", provider });
  assert.equal(result.attempted, true);
  assert.equal(result.sent, false);
  assert.deepEqual(
    { status: inspections["qa-1"].inspector_copy_sms_status, sentAt: inspections["qa-1"].inspector_copy_sms_sent_at, msgId: inspections["qa-1"].inspector_copy_sms_provider_message_id },
    { status: "FAILED", sentAt: null, msgId: null },
  );
});

test("una excepción del proveedor en la copia tampoco se propaga -- se captura, se reporta como no enviada y persiste FAILED igualmente", async () => {
  const inspections = { "qa-1": {} };
  const db = authDb({ "insp-1": { user_metadata: { phone: "+56900000099" } } }, inspections);
  const provider = { name: "SIMULATED", async send() { throw new Error("timeout"); } };
  const result = await sendInspectorCopySmsIfNeeded(db, { inspectionId: "qa-1", inspectorUserId: "insp-1", plate: "ABC123", sentAtIso: "2026-09-03T00:00:00Z", provider });
  assert.equal(result.sent, false);
  assert.equal(inspections["qa-1"].inspector_copy_sms_status, "FAILED");
});

test("un fallo al PERSISTIR (UPDATE de la BD lanza) nunca se propaga -- se captura, se loguea sanitizado, y el resultado inmediato para la UI sigue siendo correcto (2026-09-03, 'reportar/log sanitizado, NO borrar fiscalización')", async () => {
  const db = {
    auth: { admin: { async getUserById() { return { data: { user: { user_metadata: { phone: "+56900000099" } } }, error: null }; } } },
    from() { throw new Error("DB_UNREACHABLE (simulado)"); },
  };
  const provider = { name: "SIMULATED", async send() { return { ok: true, providerMessageId: "copy-2" }; } };
  const result = await sendInspectorCopySmsIfNeeded(db, { inspectionId: "qa-1", inspectorUserId: "insp-1", plate: "ABC123", sentAtIso: "2026-09-03T00:00:00Z", provider });
  assert.deepEqual(result, { attempted: true, phoneConfigured: true, sent: true, providerName: "SIMULATED", providerMessageId: "copy-2" });
});

// --- Contrato de integración: la copia solo se intenta si el SMS al conductor se envió ---

test("registerOnStreetInspection solo intenta ENVIAR la copia al inspector cuando el SMS al conductor realmente se envió (smsResult.sent)", () => {
  assert.match(source, /if \(smsResult\.attempted && smsResult\.sent\) \{\s*\n\s*inspection\.inspectorCopySms = await sendInspectorCopySmsIfNeeded/);
});

// TAREA 8 CASO D + regla D de la tarea "persist inspector sms copy trace":
// cuando el SMS al conductor SÍ se intentó pero falló, la copia nunca se
// intenta enviar -- pero el estado SKIPPED SÍ se persiste explícitamente
// (nunca queda como NULL indistinguible de "no aplicaba en absoluto").
test("cuando el SMS al conductor falla, la copia NUNCA se intenta enviar, pero SÍ se persiste explícitamente como SKIPPED (2026-09-03, TAREA 8 CASO D)", () => {
  assert.match(source, /\} else if \(smsResult\.attempted && !smsResult\.sent\) \{/);
  const s = source.indexOf("} else if (smsResult.attempted && !smsResult.sent) {");
  const block = source.slice(s, source.indexOf("\n    }", s));
  assert.doesNotMatch(block, /sendInspectorCopySmsIfNeeded/, "no debe llamar a la función que envía -- la copia nunca se intenta enviar en este caso");
  assert.match(block, /inspector_copy_sms_status: "SKIPPED"/);
  assert.match(block, /inspector_copy_sms_sent_at: null/);
});

test("un fallo o ausencia de la copia al inspector nunca revierte, duplica ni vuelve a tocar la fiscalización ya registrada (no hay ningún throw/rollback alrededor de sendInspectorCopySmsIfNeeded/persistInspectorCopySmsStatus)", () => {
  const s = source.indexOf("sendInspectorCopySmsIfNeeded(db, {");
  const block = source.slice(s, source.indexOf("\n  }", s));
  assert.doesNotMatch(block, /throw|rollback|delete\(/i);
});

test("persistInspectorCopySmsStatus nunca propaga una excepción -- un fallo de UPDATE se captura y se loguea sanitizado (sin patente/teléfono/observaciones), nunca revierte la fiscalización", () => {
  const s = source.indexOf("async function persistInspectorCopySmsStatus");
  const block = source.slice(s, source.indexOf("\n}", s));
  assert.match(block, /catch \(cause\) \{/);
  assert.match(block, /console\.error\(/);
  assert.doesNotMatch(block.split("catch")[1], /cause\.message.*plate|cause\.message.*phone/i);
});

// TAREA 5 -- idempotencia: la copia (envío Y persistencia) vive DENTRO del
// mismo guard "!inspection.reused" que ya protege el SMS al conductor --
// una repetición idempotente (doble click/reintento con la MISMA
// idempotency-key) nunca vuelve a entrar a este bloque en absoluto, así
// que nunca puede reenviar ni re-persistir la copia. No se agregó un
// reclamo atómico nuevo sobre las columnas nuevas porque esta guardia ya
// existente es suficiente (mismo criterio ya usado por el SMS al
// conductor, que SÍ tiene su propio reclamo atómico PENDING->SENDING por
// una razón distinta: sendInspectionSmsIfNeeded puede, en teoría, ser
// invocada más de una vez para la MISMA fiscalización ya creada; la copia,
// en cambio, solo se invoca desde este único punto, ya protegido).
test("TAREA 5: el envío Y la persistencia de la copia viven dentro del mismo guard idempotente '!inspection.reused' que el SMS al conductor -- nunca se ejecutan en una repetición", () => {
  const guardIndex = source.indexOf("if (!inspection.reused && inspection.smsRequired && session?.phone_normalized) {");
  const copyCallIndex = source.indexOf("inspection.inspectorCopySms = await sendInspectorCopySmsIfNeeded");
  const skippedIndex = source.indexOf('inspector_copy_sms_status: "SKIPPED"');
  assert.ok(guardIndex >= 0 && copyCallIndex > guardIndex, "el envío de la copia debe estar dentro del guard de idempotencia");
  assert.ok(skippedIndex > guardIndex, "la persistencia de SKIPPED también debe estar dentro del mismo guard");
});

test("nunca importa ni llama a createTransaction/Webpay/reconciliador -- Etapa 2 de Inspectores no toca pagos", () => {
  for (const forbidden of ["Webpay", "createTransaction", "reconcile", "payment_transactions"]) {
    assert.doesNotMatch(source, new RegExp(forbidden, "i"), forbidden);
  }
});
