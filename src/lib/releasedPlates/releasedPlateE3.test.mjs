// Pago liberado gestionado por el cliente — cierre de E3 (SOL-2026-11-04-001).
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  checkImportHeaders,
  evaluateReleasedPlateEntry,
  IMPORT_COLUMNS,
  importRowToInput,
  localTimeLabel,
  parseInstant,
  PLATE_ENTRY_DECISION,
  validateReleasedPlateInput,
} from "./releasedPlateCore.mjs";
import { regularizationOptions } from "../releasedPayment/regularizationCore.mjs";
import { releasedStayCoverage } from "../releasedPayment/releasedStayCore.mjs";

// 2026-11-18 (miércoles) en Chile (UTC-3 en noviembre).
const at = (local) => new Date(`${local}-03:00`).getTime();
const auth = (over = {}) => ({
  id: "a1", status: "ACTIVE", validFrom: new Date(at("2026-11-18T09:00:00")).toISOString(), validTo: new Date(at("2026-11-18T18:00:00")).toISOString(),
  maxUses: null, usesCount: 0, weekdaysOnly: false, durationQuantity: 9, durationUnit: "HOUR", usageMode: "MULTIPLE", modality: "FREE", ...over,
});

// --- D1: ingreso antes del inicio -----------------------------------------

test("D1: antes del inicio el mismo día se registra con beneficio y avisa la hora de inicio", () => {
  const result = evaluateReleasedPlateEntry({ enabled: true, authorizations: [auth()], now: at("2026-11-18T08:30:00") });
  assert.equal(result.decision, PLATE_ENTRY_DECISION.ELIGIBLE);
  assert.equal(result.beforeStart, true);
  assert.equal(localTimeLabel(result.startsAt), "09:00");
});

test("D1: antes del inicio pero otro día calendario: cobro normal", () => {
  const result = evaluateReleasedPlateEntry({ enabled: true, authorizations: [auth()], now: at("2026-11-17T23:50:00") });
  assert.equal(result.decision, PLATE_ENTRY_DECISION.NOT_CURRENT);
});

test("D1: dentro del período sigue igual (sin beforeStart)", () => {
  const result = evaluateReleasedPlateEntry({ enabled: true, authorizations: [auth()], now: at("2026-11-18T10:00:00") });
  assert.equal(result.decision, PLATE_ENTRY_DECISION.ELIGIBLE);
  assert.equal(result.beforeStart, false);
});

test("D1: antes del inicio respeta usos agotados y fin de semana", () => {
  assert.equal(evaluateReleasedPlateEntry({ enabled: true, authorizations: [auth({ maxUses: 1, usesCount: 1 })], now: at("2026-11-18T08:30:00") }).decision, PLATE_ENTRY_DECISION.NO_USES);
  const saturday = auth({ weekdaysOnly: true, validFrom: new Date(at("2026-11-21T09:00:00")).toISOString(), validTo: new Date(at("2026-11-21T18:00:00")).toISOString() });
  assert.equal(evaluateReleasedPlateEntry({ enabled: true, authorizations: [saturday], now: at("2026-11-21T08:30:00") }).decision, PLATE_ENTRY_DECISION.WEEKEND);
});

test("D1: la salida cobra solo los minutos previos al inicio (cobertura del snapshot)", () => {
  const result = evaluateReleasedPlateEntry({ enabled: true, authorizations: [auth()], now: at("2026-11-18T08:30:00") });
  const coverage = releasedStayCoverage(result.snapshot, new Date(at("2026-11-18T08:30:00")).toISOString(), new Date(at("2026-11-18T12:00:00")).toISOString());
  assert.equal(coverage.chargeableSeconds, 30 * 60, "solo 08:30–09:00");
  assert.equal(coverage.uncovered.length, 1);
});

test("D1: la RPC aplica la misma regla de mismo día calendario y registra before_start", async () => {
  const sql = await readFile(new URL("../../../supabase/migrations/20261118120000_released_plate_regularization_and_pre_start.sql", import.meta.url), "utf8");
  assert.match(sql, /\(v_now at time zone v_tz\)::date <> \(v_auth\.valid_from at time zone v_tz\)::date/);
  assert.match(sql, /'before_start', v_now < v_auth\.valid_from/);
});

// --- Importador ---------------------------------------------------------------

test("corrección 1: «1», «hora» o texto suelto ya no se aceptan como fecha", () => {
  for (const value of ["1", "hora", "2026", "noviembre"]) assert.equal(parseInstant(value), null, value);
  assert.notEqual(parseInstant("2026-11-18T08:00"), null, "fecha local del formulario");
  assert.notEqual(parseInstant("2026-11-18T11:00:00.000Z"), null, "instante ISO de la base al editar");
  const row = importRowToInput(["ABCD-12", "1", "hora", "Juan Soto", "12.345.678-5", "+56 9 1234 5678", "juan@correo.cl", "Convenio", "multiple", ""]);
  const validation = validateReleasedPlateInput(row);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("Indica la fecha y hora de inicio."));
});

test("corrección 2: los encabezados se comparan con la plantilla", () => {
  assert.equal(checkImportHeaders([...IMPORT_COLUMNS]).ok, true);
  assert.equal(checkImportHeaders(IMPORT_COLUMNS.map((c) => c.toUpperCase())).ok, true, "sin distinguir mayúsculas");
  const own = checkImportHeaders(["Patente", "Fecha inicio", "Hora inicio", "Cantidad"]);
  assert.equal(own.ok, false);
  assert.match(own.message, /no usa la plantilla/);
});

test("corrección 3: la ruta de importación junta todos los errores de la fila", async () => {
  const route = await readFile(new URL("../../app/api/pago-liberado/patentes/importar/route.js", import.meta.url), "utf8");
  assert.match(route, /validation\.errors\.join\(" "\)/);
  assert.match(route, /checkImportHeaders\(header\)/);
});

test("plantilla: un «Uso» no reconocido se rechaza en vez de guardarse como múltiple", () => {
  const base = ["ABCD-12", "01-12-2026 08:00", "31-12-2026 20:00", "Juan Soto", "12.345.678-5", "+56 9 1234 5678", "juan@correo.cl", "Convenio"];
  assert.equal(validateReleasedPlateInput(importRowToInput([...base, "", ""])).ok, true, "vacío = múltiple");
  assert.equal(validateReleasedPlateInput(importRowToInput([...base, "única", ""])).row.usage_mode, "SINGLE");
  const bad = validateReleasedPlateInput(importRowToInput([...base, "varias", ""]));
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.includes("Uso de la autorización inválido."));
});

test("plantilla: hoja de carga primero y sin la fila de ejemplo; ejemplo en «Instrucciones»", async () => {
  const source = await readFile(new URL("./releasedPlateExcel.js", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("export async function buildImportTemplate"), source.indexOf("export async function readImportWorkbook"));
  const sheetIdx = fn.indexOf('addWorksheet("Patentes")');
  const helpIdx = fn.indexOf('addWorksheet("Instrucciones")');
  assert.ok(sheetIdx > -1 && helpIdx > sheetIdx, "Patentes es la primera hoja");
  assert.ok(fn.indexOf('"ABCD-12"') > helpIdx, "el ejemplo va en Instrucciones, no en la hoja de carga");
  assert.match(fn, /numFmt = "@"/);
  assert.match(fn, /type: "list"/);
});

// --- D2: regularización del modelo cliente --------------------------------

test("D2: una estadía del modelo cliente se puede cerrar o anular; anulada, ya no", () => {
  const stay = { id: "s1", status: "OPEN", released_plate_authorization_id: "a1" };
  assert.deepEqual(regularizationOptions(stay, []), { canClose: true, canVoid: true });
  assert.deepEqual(regularizationOptions({ ...stay, status: "PAID" }, []), { canClose: false, canVoid: true });
  assert.deepEqual(regularizationOptions(stay, [{ stayId: "s1", action: "VOID_BENEFIT" }]), { canClose: false, canVoid: false });
  assert.deepEqual(regularizationOptions({ id: "s2", status: "OPEN" }, []), { canClose: false, canVoid: false });
});

test("D2: la RPC exige administrador, motivo y estadía del modelo cliente, sin tocar dinero", async () => {
  const sql = await readFile(new URL("../../../supabase/migrations/20261118120000_released_plate_regularization_and_pre_start.sql", import.meta.url), "utf8");
  const fn = sql.slice(sql.indexOf("create or replace function public.released_plate_regularize_stay"));
  assert.match(fn, /released_payment_admin_actor\(p_actor_id, p_parking_id\)/);
  assert.match(fn, /RELEASED_PAYMENT_REASON_REQUIRED/);
  assert.match(fn, /v_stay\.released_plate_authorization_id is null/);
  assert.match(fn, /total_amount = 0/);
  assert.match(sql, /revoke all on function public\.released_plate_regularize_stay\(uuid, uuid, uuid, text, timestamptz, text\) from public, anon, authenticated;/);
  assert.match(sql, /released_plate_stay_regularizations_immutable/);
  const route = await readFile(new URL("../../app/api/pago-liberado/patentes/estadias/[stayId]/regularizacion/route.js", import.meta.url), "utf8");
  assert.match(route, /stay\.data\.parking\?\.company_id !== auth\.actor\.companyId/, "una estadía de otra empresa responde 404");
});
