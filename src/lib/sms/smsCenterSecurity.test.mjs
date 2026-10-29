// Pruebas de seguridad transversales del Centro de Control SMS
// (SOL-2026-10-29-007): control de acceso en TODAS las rutas, ningún secreto
// hacia el navegador y compatibilidad con On Street / Off Street.
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));

async function walk(dir, predicate) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, predicate)));
    else if (predicate(entry.name)) out.push(full);
  }
  return out;
}

const read = (file) => readFile(file, "utf8");

test("todas las rutas /api/centro-sms exigen sesión Root + permiso sms:* en cada método", async () => {
  const routes = await walk(join(root, "src/app/api/centro-sms"), (n) => n === "route.js");
  assert.ok(routes.length >= 18, `rutas encontradas: ${routes.length}`);
  for (const file of routes) {
    const source = await read(file);
    const methods = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\(/g)].map((m) => m[1]);
    assert.ok(methods.length, file);
    const guards = [...source.matchAll(/authorizeSmsRequest\(request, PERMISSIONS\.SMS_[A-Z_]+\)/g)].length;
    assert.equal(guards, methods.length, `${file}: cada método debe autorizar`);
    assert.equal([...source.matchAll(/if \(authorization\.response\) return authorization\.response;/g)].length, methods.length, file);
  }
});

test("acciones que cambian datos exigen sms:manage, sms:test o sms:export (no sms:read)", async () => {
  const expectations = {
    "fallos/[source]/[id]/reenviar/route.js": "SMS_MANAGE",
    "fallos/[source]/[id]/cancelar/route.js": "SMS_MANAGE",
    "procesar/route.js": "SMS_MANAGE",
    "configuracion/retencion/route.js": "SMS_MANAGE",
    "diagnostico/prueba/route.js": "SMS_TEST_SEND",
    "diagnostico/prueba/[id]/estado/route.js": "SMS_TEST_SEND",
    "exportar/route.js": "SMS_EXPORT",
    "historial/[source]/[id]/telefono/route.js": "SMS_PHONE_FULL",
  };
  for (const [file, permission] of Object.entries(expectations)) {
    const source = await read(join(root, "src/app/api/centro-sms", file));
    assert.match(source, new RegExp(`PERMISSIONS\\.${permission}\\)`), file);
  }
  const tarifas = await read(join(root, "src/app/api/centro-sms/tarifas/route.js"));
  assert.match(tarifas, /export async function POST[\s\S]*PERMISSIONS\.SMS_MANAGE/);
  const conf = await read(join(root, "src/app/api/centro-sms/configuracion/route.js"));
  assert.match(conf, /export async function PUT[\s\S]*PERMISSIONS\.SMS_MANAGE/);
});

test("el procesador interno usa CRON_SECRET y no está programado en vercel.json", async () => {
  const source = await read(join(root, "src/app/api/internal/sms-center/process/route.js"));
  assert.match(source, /authorizeCronRequest\(request\.headers\.get\("authorization"\), process\.env\.CRON_SECRET\)/);
  const vercel = await read(join(root, "vercel.json"));
  assert.doesNotMatch(vercel, /sms-center|crons/);
});

test("ningún componente del navegador importa código de servidor ni credenciales", async () => {
  const components = await walk(join(root, "src/components/centro-sms"), (n) => n.endsWith(".js"));
  assert.ok(components.length >= 10);
  for (const file of components) {
    const source = await read(file);
    assert.match(source, /^"use client";/, file);
    assert.doesNotMatch(source, /sentraland(Core|Client)|smsCenterService|smsCenterRepository|smsAdminRepository|smsDiagnosticsCore|supabaseServer|process\.env/, file);
  }
  for (const file of await walk(join(root, "src/lib/sms"), (n) => /\.(m?js)$/.test(n) && !n.includes(".test."))) {
    assert.doesNotMatch(await read(file), /process.env.NEXT_PUBLIC_/, file);
  }
});

test("los módulos de servidor llevan la marca server-only", async () => {
  for (const name of ["smsCenterService.js", "smsCenterRepository.js", "smsAdminRepository.js", "smsApiAuth.js", "sentralandClient.mjs"]) {
    assert.match(await read(join(root, "src/lib/sms", name)), /^import "server-only";/, name);
  }
});

test("la migración no expone objetos sms_* a anon/authenticated y activa RLS en todas las tablas", async () => {
  const sql = await read(join(root, "supabase/migrations/20261029220000_sms_control_center.sql"));
  const tables = [...sql.matchAll(/create table if not exists public\.(sms_[a-z_]+)/g)].map((m) => m[1]);
  assert.equal(tables.length, 7);
  for (const table of tables) assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`), table);
  assert.doesNotMatch(sql, /grant [^;]* to (anon|authenticated)/i);
  const functions = [...sql.matchAll(/create or replace function public\.(sms_[a-z_]+)\(/g)].map((m) => m[1]);
  for (const fn of functions) assert.match(sql, new RegExp(`revoke all on function [^;]*public\\.${fn}\\(`), fn);
});

test("compatibilidad: no se modificó ningún archivo SMS existente de On Street / Inspector", async () => {
  // Contenido de referencia mínimo: firmas públicas que On Street usa hoy.
  const provider = await read(join(root, "src/lib/onStreetSmsProviderCore.mjs"));
  assert.match(provider, /export function resolveSmsProvider\(name = process\.env\.SMS_PROVIDER \|\| "simulated"\)/);
  assert.match(provider, /export function createSentralandSmsProvider\(\{ getToken = sentralandGetToken, sendSms = sentralandSendSms, queryStatus = sentralandQueryStatus \} = \{\}\)/);
  const core = await read(join(root, "src/lib/onStreetSmsCore.mjs"));
  assert.doesNotMatch(core, /sms_messages|smsCenter/);
  const inspector = await read(join(root, "src/lib/inspector/inspectorInspectionService.js"));
  assert.doesNotMatch(inspector, /sms_messages|smsCenter/);
});

test("compatibilidad Off Street: los prefijos y permisos existentes siguen intactos", async () => {
  const { canAccessPath, ROLES } = await import("../auth/permissions.mjs");
  const admin = { portal: "client", role: ROLES.COMPANY_ADMIN, enabledProducts: ["OFF_STREET"], companyId: "c1" };
  assert.equal(canAccessPath(admin, "/estacionamientos"), true);
  assert.equal(canAccessPath(admin, "/pago-liberado"), true);
  assert.equal(canAccessPath(admin, "/on-street-qr"), false);
  assert.equal(canAccessPath({ portal: "terminal", role: ROLES.OPERATOR }, "/pos"), true);
  assert.equal(canAccessPath({ portal: "terminal", role: ROLES.OPERATOR }, "/centro-sms"), false);
});
