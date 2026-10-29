import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyHistoryFilters, buildTimeline, deliveryRate, parseSmsFilters, shapeHistoryRow, summaryParams, toCsv, zonedDayStartIso } from "./smsHistoryCore.mjs";
import { canAccessPath, hasPermission, PERMISSIONS, ROLES } from "../auth/permissions.mjs";
import { navigationItems } from "../../config/navigation.js";

const params = (obj) => new URLSearchParams(obj);
const NOW = new Date("2026-10-29T15:00:00Z");

test("fechas: inicio del día en Santiago (horario de verano y de invierno)", () => {
  assert.equal(zonedDayStartIso("2026-10-29"), "2026-10-29T03:00:00.000Z"); // UTC-3
  assert.equal(zonedDayStartIso("2026-06-15"), "2026-06-15T04:00:00.000Z"); // UTC-4
  assert.equal(zonedDayStartIso("2026-02-30"), null);
  assert.equal(zonedDayStartIso("29-10-2026"), null);
});

test("filtros por defecto: últimos 30 días, hora de Chile, sin simulados", () => {
  const f = parseSmsFilters(params({}), { now: NOW });
  assert.equal(f.to, "2026-10-29");
  assert.equal(f.from, "2026-09-30");
  assert.equal(f.toIso, "2026-10-30T03:00:00.000Z");
  assert.equal(f.includeSimulated, false);
  assert.deepEqual([f.page, f.pageSize, f.sort, f.dir, f.bucket], [1, 25, "created_at", "desc", "day"]);
});

test("filtros: valores fuera de catálogo se rechazan con el campo", () => {
  const bad = [{ modulo: "X" }, { estado: "SENT" }, { establecimiento: "no-uuid" }, { empresa: "a;drop" }, { orden: "body" }, { agrupar: "year" }, { desde: "2026-10-30", hasta: "2026-10-01" }, { desde: "2024-01-01", hasta: "2026-10-29" }, { origen: "OTRO" }];
  for (const input of bad) assert.throws(() => parseSmsFilters(params(input), { now: NOW }), { code: "SMS_FILTER_INVALID" }, JSON.stringify(input));
});

test("filtros: combinación válida, búsqueda saneada y tamaño de página acotado", () => {
  const f = parseSmsFilters(params({ desde: "2026-10-01", hasta: "2026-10-29", empresa: "EMP-01", establecimiento: "0b5f6c0e-1111-4222-8333-944455556666", modulo: "ON_STREET", estado: "DELIVERED", simulados: "1", q: "4044'); drop", tamano: "500", pagina: "3", dir: "asc", orden: "sent_at", agrupar: "week" }), { now: NOW });
  assert.equal(f.q, "4044 drop");
  assert.equal(f.pageSize, 25);
  assert.deepEqual([f.page, f.dir, f.sort, f.bucket, f.includeSimulated], [3, "asc", "sent_at", "week", true]);
  assert.deepEqual(summaryParams(f), { from: f.fromIso, to: f.toIso, company_id: "EMP-01", parking_id: "0b5f6c0e-1111-4222-8333-944455556666", module: "ON_STREET", status: "DELIVERED", include_simulated: true, bucket: "week" });
});

function recorder() {
  const calls = [];
  const api = new Proxy({}, { get: (_, method) => (...args) => { calls.push([method, ...args]); return api; } });
  return { api, calls };
}

test("consulta: aplica rango, filtros, exclusión de simulados y búsqueda por teléfono", () => {
  const { api, calls } = recorder();
  applyHistoryFilters(api, parseSmsFilters(params({ modulo: "ON_STREET", q: "9 6651 4044" }), { now: NOW }));
  const methods = calls.map((c) => `${c[0]}:${c[1]}`);
  assert.ok(methods.includes("gte:created_at"));
  assert.ok(methods.includes("lt:created_at"));
  assert.ok(methods.includes("eq:module"));
  assert.deepEqual(calls.find((c) => c[1] === "is_simulated"), ["eq", "is_simulated", false]);
  const or = calls.find((c) => c[0] === "or")[1];
  assert.match(or, /phone_normalized\.like\.\*66514044\*/);
  assert.match(or, /phone_last4\.eq\.4044/);
  assert.doesNotMatch(or, / /);
});

test("consulta: con simulados no se filtra is_simulated", () => {
  const { api, calls } = recorder();
  applyHistoryFilters(api, parseSmsFilters(params({ simulados: "1" }), { now: NOW }));
  assert.equal(calls.some((c) => c[1] === "is_simulated"), false);
});

test("tasa de entrega: entregados/aceptados; sin aceptados no hay tasa", () => {
  assert.equal(deliveryRate({ accepted: 3, delivered: 1 }), 33.3);
  assert.equal(deliveryRate({ accepted: 0, delivered: 0 }), null);
  assert.equal(deliveryRate(null), null);
});

const legacyRow = {
  source: "ON_STREET_INSPECTION", source_id: "11111111-2222-4333-8444-555555555555", message_id: null,
  created_at: "2026-10-01T12:00:00Z", sent_at: "2026-10-01T12:00:05Z", accepted_at: "2026-10-01T12:00:05Z", delivered_at: null,
  company_id: "EMP-01", parking_id: "p1", module: "ON_STREET", message_type: "INSPECTION_OVERDUE", origin_user_id: "u1",
  phone_normalized: "+56966514044", phone_last4: "4044", body: null, status: "PENDING_CONFIRMATION", provider: "SENTRALAND",
  is_simulated: false, provider_message_id: "SENTR1", provider_code: null, provider_description: "ENROUTE", error_code: null, error_category: null, attempts: 1,
};

test("fila: teléfono enmascarado, contenido según permiso, nombres resueltos", () => {
  const masked = shapeHistoryRow(legacyRow, { companies: { "EMP-01": "Municipalidad" }, users: { u1: "Inspector Uno" } });
  assert.equal(masked.phone, "+56 9 ****4044");
  assert.equal(masked.phoneMasked, true);
  assert.equal(masked.body, null);
  assert.equal(masked.bodyHidden, true);
  assert.equal(masked.companyName, "Municipalidad");
  assert.equal(masked.originUserName, "Inspector Uno");
  assert.equal(masked.statusLabel, "Pendiente de confirmación");
  const central = shapeHistoryRow({ ...legacyRow, source: "CENTRAL", body: "Hola", company_id: null, origin_user_id: null }, { canSeeContent: true });
  assert.equal(central.body, "Hola");
  assert.equal(central.companyName, "Sin empresa (transversal)");
  assert.equal(central.originUserName, "Sistema");
  assert.equal(shapeHistoryRow(legacyRow, { canSeeFullPhone: true }).phone, "+56966514044");
});

test("línea de tiempo: central usa eventos reales; heredado se marca reconstruido", () => {
  const central = buildTimeline({ source: "CENTRAL" }, [
    { created_at: "2026-10-01T12:00:02Z", from_status: "QUEUED", to_status: "SENDING", source: "SYSTEM" },
    { created_at: "2026-10-01T12:00:01Z", from_status: null, to_status: "QUEUED", source: "SYSTEM" },
  ]);
  assert.deepEqual(central.map((e) => e.toStatus), ["QUEUED", "SENDING"]);
  assert.equal(central.every((e) => !e.reconstructed), true);
  const legacy = buildTimeline(legacyRow);
  assert.equal(legacy.every((e) => e.reconstructed), true);
  assert.deepEqual(legacy.map((e) => e.toStatus), ["CREATED", "ACCEPTED", "PENDING_CONFIRMATION"]);
});

test("CSV: separador ; con BOM, comillas y protección contra fórmulas", () => {
  const csv = toCsv([{ key: "a", label: "A" }, { key: "b", label: "B" }], [{ a: "=SUM(1)", b: 'x;"y"' }]);
  assert.ok(csv.startsWith("﻿A;B\r\n"));
  assert.match(csv, /'=SUM\(1\);"x;""y"""/);
});

test("permisos: solo Root accede al Centro SMS y tiene todos los permisos sms:*", () => {
  const sms = [PERMISSIONS.SMS_READ, PERMISSIONS.SMS_MANAGE, PERMISSIONS.SMS_TEST_SEND, PERMISSIONS.SMS_PHONE_FULL, PERMISSIONS.SMS_CONTENT_READ, PERMISSIONS.SMS_EXPORT];
  for (const permission of sms) {
    assert.equal(hasPermission(ROLES.PLATFORM_ADMIN, permission), true, permission);
    for (const role of [ROLES.COMPANY_ADMIN, ROLES.OPERATOR, ROLES.INSPECTOR]) assert.equal(hasPermission(role, permission), false, `${role} ${permission}`);
  }
  assert.equal(canAccessPath({ portal: "root", role: ROLES.PLATFORM_ADMIN }, "/centro-sms/historial"), true);
  assert.equal(canAccessPath({ portal: "client", role: ROLES.COMPANY_ADMIN, enabledProducts: ["ON_STREET", "OFF_STREET"], companyId: "c1" }, "/centro-sms"), false);
  assert.equal(canAccessPath({ portal: "client", role: ROLES.OPERATOR, enabledProducts: ["OFF_STREET"], companyId: "c1" }, "/centro-sms/diagnostico"), false);
  assert.equal(canAccessPath({ portal: "inspector", role: ROLES.INSPECTOR }, "/centro-sms"), false);
});

test("menú: grupo «Centro de Control SMS» con los 7 submenús, sin quitar los existentes", () => {
  const group = navigationItems.find((item) => item.label === "Centro de Control SMS");
  assert.ok(group);
  assert.deepEqual(group.children.map((c) => c.label), ["Resumen general", "Historial de mensajes", "Mensajes recibidos", "Fallos y reintentos", "Consumo y costos", "Diagnóstico y pruebas", "Configuración y permisos"]);
  for (const label of ["Inicio", "Off Street", "On Street", "Administración"]) assert.ok(navigationItems.some((item) => item.label === label), label);
});

test("rutas API: todas exigen sesión Root + permiso sms:*", async () => {
  const files = ["resumen/route.js", "historial/route.js", "historial/[source]/[id]/route.js", "historial/[source]/[id]/telefono/route.js", "opciones/route.js"];
  for (const file of files) {
    const source = await readFile(new URL(`../../app/api/centro-sms/${file}`, import.meta.url), "utf8");
    assert.match(source, /authorizeSmsRequest\(request, PERMISSIONS\.SMS_[A-Z_]+\)/, file);
    assert.match(source, /if \(authorization\.response\) return authorization\.response;/, file);
  }
  const auth = await readFile(new URL("./smsApiAuth.js", import.meta.url), "utf8");
  assert.match(auth, /requirePlatformAdmin\(authorization\.context\)/);
  assert.match(auth, /requirePermission\(authorization\.context, permission\)/);
});
