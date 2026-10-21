import assert from "node:assert/strict";
import test from "node:test";
import {
  maskInspectorPhone,
  inspectorSmsSendUiState,
  inspectorSmsDeliveryUiState,
  resolveInspectorSmsReportPeriod,
  filterInspectorSmsReportRows,
  inspectorSmsReportRowInScope,
  INSPECTOR_SMS_REPORT_PERIODS,
} from "./inspectorSmsReportCore.mjs";

// --- Alcance RBAC (2026-09-03, agregado tras revisión de la decisión de
// diseño) -- pruebas REALES (llamadas a la función pura, no solo
// inspección de código fuente) para la lógica más sensible del feature. ---

test("TAREA A: inspector A ve sus propios SMS -- scope 'own' con inspectorUserId=A calza con una fila de A", () => {
  assert.equal(inspectorSmsReportRowInScope({ inspector_user_id: "A" }, { type: "own", inspectorUserId: "A" }), true);
});

test("TAREA B: inspector A NO ve SMS de inspector B -- misma fila de B, scope de A -> false", () => {
  assert.equal(inspectorSmsReportRowInScope({ inspector_user_id: "B" }, { type: "own", inspectorUserId: "A" }), false);
});

test("TAREA E: platform_admin (scope 'global') ve filas de CUALQUIER inspector", () => {
  assert.equal(inspectorSmsReportRowInScope({ inspector_user_id: "A" }, { type: "global" }), true);
  assert.equal(inspectorSmsReportRowInScope({ inspector_user_id: "B" }, { type: "global" }), true);
});

test("company_admin (scope 'company') ve solo filas cuyo parking_id esté en su lista -- nunca una fila de otra empresa ni sin parking_id (NO_SESSION/OTHER)", () => {
  const scope = { type: "company", parkingIds: ["p1", "p2"] };
  assert.equal(inspectorSmsReportRowInScope({ parking_id: "p1" }, scope), true);
  assert.equal(inspectorSmsReportRowInScope({ parking_id: "p3" }, scope), false);
  assert.equal(inspectorSmsReportRowInScope({ parking_id: null }, scope), false);
});

test("fail-closed: scope ausente/malformado/de tipo desconocido NUNCA cae a acceso global -- solo type==='global' explícito", () => {
  assert.equal(inspectorSmsReportRowInScope({ inspector_user_id: "A" }, undefined), false);
  assert.equal(inspectorSmsReportRowInScope({ inspector_user_id: "A" }, {}), false);
  assert.equal(inspectorSmsReportRowInScope({ inspector_user_id: "A" }, { type: "algo_inventado" }), false);
});

test("una fila null/inexistente nunca calza con ningún scope, ni siquiera 'global'", () => {
  assert.equal(inspectorSmsReportRowInScope(null, { type: "global" }), false);
});

// --- TAREA 5 / TAREA 10.B: enmascarado de teléfono ---
test("TAREA 10.B: enmascara el teléfono canónico +569XXXXXXXX a '+56 9 *** XXXX'", () => {
  assert.equal(maskInspectorPhone("+56900000902"), "+56 9 *** 0902");
  assert.equal(maskInspectorPhone("+56900000901"), "+56 9 *** 0901");
});

test("teléfono ausente o con formato no canónico nunca expone dígitos crudos", () => {
  assert.equal(maskInspectorPhone(null), "—");
  assert.equal(maskInspectorPhone(""), "—");
  assert.equal(maskInspectorPhone("12345"), "***");
});

// --- TAREA 3 / TAREA 10.F: estado envío ---
test("TAREA 10.F: sms_status=SENT -> ENVIADO AL PROVEEDOR (nunca 'Enviado' a secas -- nunca implica entrega)", () => {
  assert.deepEqual(inspectorSmsSendUiState({ smsRequired: true, smsStatus: "SENT" }), { label: "ENVIADO AL PROVEEDOR", tone: "success" });
});

test("sms_status=FAILED -> ERROR; smsRequired=false -> NO REQUERIDO; PENDING/SENDING -> PENDIENTE", () => {
  assert.deepEqual(inspectorSmsSendUiState({ smsRequired: true, smsStatus: "FAILED" }), { label: "ERROR", tone: "error" });
  assert.deepEqual(inspectorSmsSendUiState({ smsRequired: false }), { label: "NO REQUERIDO", tone: "neutral" });
  assert.deepEqual(inspectorSmsSendUiState({ smsRequired: true, smsStatus: "PENDING" }), { label: "PENDIENTE", tone: "neutral" });
});

// --- TAREA 3 / TAREA 10.D/E/F: estado DLR ---
test("TAREA 10.D: DELIVRD (ya mapeado a DELIVERED) -> ENTREGADO", () => {
  assert.deepEqual(inspectorSmsDeliveryUiState({ smsRequired: true, smsStatus: "SENT", smsDeliveryStatus: "DELIVERED" }), { label: "ENTREGADO", tone: "success" });
});

test("TAREA 10.E: UNDELIV (UNDELIVERED) -> NO ENTREGADO", () => {
  assert.deepEqual(inspectorSmsDeliveryUiState({ smsRequired: true, smsStatus: "SENT", smsDeliveryStatus: "UNDELIVERED" }), { label: "NO ENTREGADO", tone: "error" });
});

test("EXPIRED -> EXPIRADO, REJECTED -> RECHAZADO, UNKNOWN -> DESCONOCIDO", () => {
  assert.equal(inspectorSmsDeliveryUiState({ smsRequired: true, smsStatus: "SENT", smsDeliveryStatus: "EXPIRED" }).label, "EXPIRADO");
  assert.equal(inspectorSmsDeliveryUiState({ smsRequired: true, smsStatus: "SENT", smsDeliveryStatus: "REJECTED" }).label, "RECHAZADO");
  assert.equal(inspectorSmsDeliveryUiState({ smsRequired: true, smsStatus: "SENT", smsDeliveryStatus: "UNKNOWN" }).label, "DESCONOCIDO");
});

test("TAREA 10.F: ACCEPTED o nunca consultado (null) -> PENDIENTE (ambos significan 'sin confirmación final todavía')", () => {
  assert.equal(inspectorSmsDeliveryUiState({ smsRequired: true, smsStatus: "SENT", smsDeliveryStatus: "ACCEPTED" }).label, "PENDIENTE");
  assert.equal(inspectorSmsDeliveryUiState({ smsRequired: true, smsStatus: "SENT", smsDeliveryStatus: null }).label, "PENDIENTE");
});

test("si el envío nunca fue SENT (FAILED, PENDING) o no era requerido, el DLR es NO APLICA -- nunca se inventa un estado de entrega para algo que no se aceptó", () => {
  assert.equal(inspectorSmsDeliveryUiState({ smsRequired: true, smsStatus: "FAILED", smsDeliveryStatus: null }).label, "NO APLICA");
  assert.equal(inspectorSmsDeliveryUiState({ smsRequired: false }).label, "NO APLICA");
});

// --- TAREA 6: períodos ---
test("períodos soportados: hoy / 7 días / 30 días", () => {
  assert.deepEqual(INSPECTOR_SMS_REPORT_PERIODS, ["today", "7d", "30d"]);
});

test("TAREA 10.C: 'today' acota desde las 00:00:00 del mismo día hasta 'now'", () => {
  const now = new Date("2026-09-03T15:30:00.000Z");
  const bounds = resolveInspectorSmsReportPeriod("today", now);
  assert.equal(bounds.to, now.toISOString());
  assert.ok(new Date(bounds.from) <= now);
  assert.equal(new Date(bounds.from).getHours(), 0);
});

test("'7d'/'30d' retroceden exactamente 6/29 días de calendario locales desde hoy (7/30 días inclusive)", () => {
  const now = new Date();
  const b7 = resolveInspectorSmsReportPeriod("7d", now);
  const b30 = resolveInspectorSmsReportPeriod("30d", now);
  const expected7 = new Date(now); expected7.setDate(expected7.getDate() - 6); expected7.setHours(0, 0, 0, 0);
  const expected30 = new Date(now); expected30.setDate(expected30.getDate() - 29); expected30.setHours(0, 0, 0, 0);
  assert.equal(b7.from, expected7.toISOString());
  assert.equal(b30.from, expected30.toISOString());
  assert.equal(b7.to, now.toISOString());
});

test("un período desconocido devuelve null, nunca un rango inventado", () => {
  assert.equal(resolveInspectorSmsReportPeriod("century"), null);
});

// --- TAREA 6: filtros en memoria ---
test("TAREA 10.C: filtro por patente es substring case-insensitive", () => {
  const rows = [{ plate: "QA9001" }, { plate: "ABC123" }];
  assert.deepEqual(filterInspectorSmsReportRows(rows, { plate: "qa" }), [{ plate: "QA9001" }]);
});

test("filtro por teléfono ignora formato (espacios/guiones) y compara solo dígitos", () => {
  const rows = [{ plate: "A", phone: "+56900000901" }, { plate: "B", phone: "+56900000902" }];
  assert.deepEqual(filterInspectorSmsReportRows(rows, { phone: "0902" }), [{ plate: "B", phone: "+56900000902" }]);
});

test("filtro por estado envío/DLR usa EXACTAMENTE las mismas etiquetas que ve el usuario en pantalla", () => {
  const rows = [
    { plate: "A", smsRequired: true, smsStatus: "SENT", smsDeliveryStatus: "DELIVERED" },
    { plate: "B", smsRequired: true, smsStatus: "FAILED" },
  ];
  assert.deepEqual(filterInspectorSmsReportRows(rows, { sendStatus: "ERROR" }).map((r) => r.plate), ["B"]);
  assert.deepEqual(filterInspectorSmsReportRows(rows, { deliveryStatus: "ENTREGADO" }).map((r) => r.plate), ["A"]);
});

test("sin filtros, devuelve todas las filas sin modificarlas", () => {
  const rows = [{ plate: "A" }, { plate: "B" }];
  assert.deepEqual(filterInspectorSmsReportRows(rows, {}), rows);
});
