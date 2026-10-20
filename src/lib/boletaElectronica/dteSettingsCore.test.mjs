import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  decryptDteApiKey,
  dteAuditAction,
  dteAuditChanges,
  dteRootStatusView,
  dteSettingsView,
  DTE_STATUS,
  encryptDteApiKey,
  maskedApiKey,
  resolveDteStatus,
  validateDteSettingsInput,
} from "./dteSettingsCore.mjs";
import { canAccessPath, ROLES } from "../auth/permissions.mjs";

// Boleta electrónica (SOL-2026-10-20-001): configuración Haulmer por empresa.
const SECRET = "x".repeat(40);
const KEY = "hk_test_ABCDEF1234567890wxyz";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const EMITTER = { businessName: "Clínica Ramis SpA", activity: "ESTACIONAMIENTOS", address: "Av. Siempre Viva 123", commune: "Curicó" };
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("boleta electrónica: la API Key se cifra (AES-256-GCM) y solo se descifra con la clave del servidor", () => {
  const cipher = encryptDteApiKey(KEY, SECRET);
  assert.ok(cipher.startsWith("v1."));
  assert.equal(cipher.includes(KEY), false);
  assert.notEqual(encryptDteApiKey(KEY, SECRET), cipher, "IV aleatorio");
  assert.equal(decryptDteApiKey(cipher, SECRET), KEY);
  assert.throws(() => decryptDteApiKey(cipher, "y".repeat(40)));
  assert.throws(() => encryptDteApiKey(KEY, "corta"), { code: "DTE_ENCRYPTION_KEY_NOT_CONFIGURED" });
});

test("boleta electrónica: validación del formulario del administrador", () => {
  const ok = validateDteSettingsInput({ environment: "TEST", apiKey: ` ${KEY} `, parkingIds: [P2, P1, P1], emitter: EMITTER, branchCodes: { [P1]: " 81303347 ", [P2]: "" } }, { allowedParkingIds: [P1, P2] });
  assert.deepEqual(ok, { environment: "TEST", parkingIds: [P1, P2], apiKeyAction: "SET", apiKey: KEY, emitter: { ...EMITTER, city: "" }, branchCodes: { [P1]: "81303347" } });
  assert.equal(validateDteSettingsInput({ environment: "PRODUCTION", parkingIds: [P1], emitter: EMITTER }, { allowedParkingIds: [P1], hasStoredKey: true }).apiKeyAction, "KEEP");
  // Sin estacionamientos activos los datos del emisor pueden quedar incompletos.
  assert.equal(validateDteSettingsInput({ environment: "TEST", parkingIds: [] }).parkingIds.length, 0);
  assert.throws(() => validateDteSettingsInput({ environment: "TEST", parkingIds: [P1], emitter: { ...EMITTER, activity: " " } }, { allowedParkingIds: [P1], hasStoredKey: true }), /datos del emisor: giro/);
  assert.throws(() => validateDteSettingsInput({ environment: "TEST", branchCodes: { [P1]: "81A" } }, { allowedParkingIds: [P1] }), /solo números/);
  assert.throws(() => validateDteSettingsInput({ environment: "TEST", branchCodes: { [P2]: "123" } }, { allowedParkingIds: [P1] }), /no pertenecen/);
  assert.equal(validateDteSettingsInput({ environment: "TEST", removeApiKey: true, parkingIds: [] }, { hasStoredKey: true }).apiKeyAction, "REMOVE");
  assert.throws(() => validateDteSettingsInput({ environment: "OTRO" }), { code: "DTE_SETTINGS_INVALID" });
  assert.throws(() => validateDteSettingsInput({ environment: "TEST", apiKey: "corta" }), /entre 16 y 256/);
  assert.throws(() => validateDteSettingsInput({ environment: "TEST", apiKey: "con espacios en la clave larga" }), /sin espacios/);
  assert.throws(() => validateDteSettingsInput({ environment: "TEST", apiKey: KEY, parkingIds: ["33333333-3333-4333-8333-333333333333"] }, { allowedParkingIds: [P1] }), /no pertenecen/);
  assert.throws(() => validateDteSettingsInput({ environment: "TEST", parkingIds: [P1] }, { allowedParkingIds: [P1] }), /primero carga la API Key/);
  assert.throws(() => validateDteSettingsInput({ environment: "TEST", removeApiKey: true, parkingIds: [P1] }, { allowedParkingIds: [P1], hasStoredKey: true }), /primero carga/);
  assert.throws(() => validateDteSettingsInput({ environment: "TEST", removeApiKey: true, apiKey: KEY }, { hasStoredKey: true }), /a la vez/);
});

test("boleta electrónica: el administrador ve la API Key solo enmascarada y Root solo el estado", () => {
  const row = { provider: "HAULMER", environment: "TEST", api_key_ciphertext: encryptDteApiKey(KEY, SECRET), api_key_last4: "wxyz", enabled_parking_ids: [P1], updated_at: "2026-10-20T15:00:00Z" };
  const company = { rut_number: "76111222", rut_dv: "3", business_name: "Clínica Ramis SpA", business_activity: "SALUD", address: "Calle 1", district: "Curicó", city: "Curicó" };
  const view = dteSettingsView({ ...row, emitter_activity: "ESTACIONAMIENTOS", parking_branch_codes: { [P1]: "81303347" } }, [{ id: P1, name: "Central", code: "C1" }, { id: P2, name: "Norte" }], company);
  assert.equal(view.apiKeyMasked, "••••wxyz");
  assert.equal(view.status, DTE_STATUS.CONFIGURED);
  assert.equal(view.emissionAvailable, true);
  // Emisor: lo guardado prevalece; lo que falta se sugiere desde la empresa. RUT siempre el de la empresa.
  assert.deepEqual(view.emitter, { rut: "76111222-3", businessName: "Clínica Ramis SpA", activity: "ESTACIONAMIENTOS", address: "Calle 1", commune: "Curicó", city: "Curicó" });
  assert.deepEqual(view.parkings.map((parking) => parking.branchCode), ["81303347", ""]);
  assert.deepEqual(view.parkings.map((parking) => parking.enabled), [true, false]);
  assert.equal(JSON.stringify(view).includes(row.api_key_ciphertext), false);
  assert.equal(JSON.stringify(view).includes(KEY), false);

  const root = dteRootStatusView({ id: "c1", trade_name: "Clínica" }, row);
  assert.deepEqual(Object.keys(root).sort(), ["companyId", "companyName", "enabledParkings", "environment", "provider", "status", "updatedAt"]);
  assert.equal(JSON.stringify(root).includes("wxyz"), false);
  assert.equal(maskedApiKey(null), null);
});

test("boleta electrónica: estado según API Key y estacionamientos", () => {
  assert.equal(resolveDteStatus(null), DTE_STATUS.NOT_CONFIGURED);
  assert.equal(resolveDteStatus({ api_key_ciphertext: "v1.x", enabled_parking_ids: [] }), DTE_STATUS.CONFIGURED_INACTIVE);
  assert.equal(resolveDteStatus({ api_key_ciphertext: "v1.x", enabled_parking_ids: [P1] }), DTE_STATUS.CONFIGURED);
});

test("boleta electrónica: la auditoría registra cambios sin la API Key", () => {
  const previous = { environment: "TEST", api_key_ciphertext: "v1.x", enabled_parking_ids: [P1] };
  const next = { environment: "PRODUCTION", parkingIds: [P1, P2], apiKeyAction: "SET", apiKey: KEY };
  const changes = dteAuditChanges(previous, next);
  assert.deepEqual(changes, { environment: { from: "TEST", to: "PRODUCTION" }, enabledParkingIds: { from: [P1], to: [P1, P2] }, apiKey: "SET" });
  assert.equal(JSON.stringify(changes).includes(KEY), false);
  assert.equal(dteAuditAction(previous, next), "API_KEY_REPLACED");
  assert.equal(dteAuditAction(null, next), "API_KEY_SET");
  assert.equal(dteAuditAction(previous, { ...next, apiKeyAction: "REMOVE" }), "API_KEY_REMOVED");
  assert.equal(dteAuditAction(previous, { ...next, apiKeyAction: "KEEP" }), "SETTINGS_SAVED");
});

test("boleta electrónica: solo el administrador con Off Street abre la pantalla (Root también, para ver el estado)", () => {
  const path = "/tarifas/modulos/boleta-electronica";
  assert.equal(canAccessPath({ portal: "client", role: ROLES.COMPANY_ADMIN, enabledProducts: ["OFF_STREET"] }, path), true);
  assert.equal(canAccessPath({ portal: "client", role: ROLES.OPERATOR, enabledProducts: ["OFF_STREET"] }, path), false);
  assert.equal(canAccessPath({ portal: "client", role: ROLES.COMPANY_ADMIN, enabledProducts: ["ON_STREET"] }, path), false);
  assert.equal(canAccessPath({ portal: "root", role: ROLES.PLATFORM_ADMIN, enabledProducts: [] }, path), true);
});

test("boleta electrónica: la API no expone la API Key, Root no la edita y el navegador no importa el cifrado", () => {
  const server = read("./dteSettingsServer.js");
  const route = read("../../app/api/boleta-electronica/route.js");
  const page = read("../../app/tarifas/modulos/boleta-electronica/page.js");
  assert.match(route, /DTE_ROOT_READ_ONLY/);
  assert.match(server, /ROLES\.COMPANY_ADMIN/);
  assert.equal(/select\([^)]*api_key_ciphertext[^)]*\)[\s\S]{0,80}NextResponse/.test(route), false);
  assert.equal(page.includes("dteSettingsCore"), false, "el componente cliente no debe arrastrar node:crypto");
  assert.match(page, /type="password"/);
  const migration = read("../../../supabase/migrations/20261020120000_company_dte_settings.sql");
  assert.match(migration, /revoke all on table public\.company_dte_settings from public, anon, authenticated/);
  assert.match(migration, /enable row level security/);
});
