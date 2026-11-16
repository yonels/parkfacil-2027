import test from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCT_SCOPES,
  ACCESS_DURATION_PRESET_HOURS,
  ACTIVATION_ACTIONS,
  applyProductScope,
  resolveDefaultProductScope,
  validateProductScopeForCreation,
  functionLabel,
  isMembershipWithinAccessWindow,
  isCompanyOperational,
  isMemberAuthorizedToOperate,
  resolveDisplayStatus,
  computeAccessExpiresAt,
  buildActivationUpdate,
  actorCanActivate,
  isValidCompanyAdmin,
  wouldRemoveLastCompanyAdmin,
  guardLastCompanyAdmin,
  LAST_ADMIN_ERROR_CODE,
} from "./memberActivationCore.mjs";

// ============================================================
// FASE 14 -- los 14 casos exigidos por el encargo, en orden.
// ============================================================

test("Caso 1: usuario invited no puede operar", () => {
  assert.equal(isMemberAuthorizedToOperate({ companyStatus: "active", memberStatus: "invited", accessExpiresAt: null }), false);
});

test("Caso 2: empresa onboarding no permite operación cliente (aunque el miembro esté active)", () => {
  assert.equal(isMemberAuthorizedToOperate({ companyStatus: "onboarding", memberStatus: "active", accessExpiresAt: null }), false);
  assert.equal(isCompanyOperational("onboarding"), false);
});

test("Caso 3: usuario active indefinido puede operar", () => {
  assert.equal(isMemberAuthorizedToOperate({ companyStatus: "active", memberStatus: "active", accessExpiresAt: null }), true);
});

test("Caso 4: usuario active temporal vigente puede operar", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  const expiresEnUnaHora = new Date("2026-09-10T13:00:00Z").toISOString();
  assert.equal(isMemberAuthorizedToOperate({ companyStatus: "active", memberStatus: "active", accessExpiresAt: expiresEnUnaHora, now }), true);
});

test("Caso 5: usuario cuyo access_expires_at venció no puede operar", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  const vencidoHaceUnaHora = new Date("2026-09-10T11:00:00Z").toISOString();
  assert.equal(isMemberAuthorizedToOperate({ companyStatus: "active", memberStatus: "active", accessExpiresAt: vencidoHaceUnaHora, now }), false);
});

test("Caso 5b: el vencimiento exacto (now === access_expires_at) también rechaza (>, no >=)", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  assert.equal(isMembershipWithinAccessWindow({ status: "active", accessExpiresAt: now.toISOString(), now }), false);
});

test("Caso 6: suspended no puede operar", () => {
  assert.equal(isMemberAuthorizedToOperate({ companyStatus: "active", memberStatus: "suspended", accessExpiresAt: null }), false);
});

test("Caso 7: Root puede activar (platform_admin en portal root)", () => {
  assert.equal(actorCanActivate({ actorRole: "platform_admin", actorPortal: "root" }), true);
});

test("Caso 8: company_admin NO puede activar", () => {
  assert.equal(actorCanActivate({ actorRole: "company_admin", actorPortal: "client" }), false);
  // Ni siquiera si por error llegara con portal="root" (defensa en profundidad):
  assert.equal(actorCanActivate({ actorRole: "company_admin", actorPortal: "root" }), false);
});

test("Caso 9: operador Off Street no obtiene acceso On Street", () => {
  const enabledProducts = ["OFF_STREET", "ON_STREET"]; // empresa con ambos
  const scoped = applyProductScope(enabledProducts, "OFF_STREET");
  assert.deepEqual(scoped, ["OFF_STREET"]);
  assert.ok(!scoped.includes("ON_STREET"));
});

test("Caso 10: inspector On Street no obtiene acceso Off Street", () => {
  const enabledProducts = ["OFF_STREET", "ON_STREET"];
  const scoped = applyProductScope(enabledProducts, "ON_STREET");
  assert.deepEqual(scoped, ["ON_STREET"]);
  assert.ok(!scoped.includes("OFF_STREET"));
});

test("Caso 11: empresa con un solo producto no permite crear usuarios del otro", () => {
  const soloOffStreet = ["OFF_STREET"];
  const resultado = validateProductScopeForCreation({ role: "operator", productScope: "ON_STREET", companyEnabledProducts: soloOffStreet });
  assert.equal(resultado.ok, false);
  assert.match(resultado.error, /no tiene ese producto habilitado/i);
});

test("Caso 12 / 15: no se puede suspender el último company_admin válido", () => {
  const target = { user_id: "admin-1", role: "company_admin", status: "active" };
  const otherMembers = [{ user_id: "op-1", role: "operator", status: "active" }];
  const resultado = guardLastCompanyAdmin({ targetMember: target, changes: { status: "suspended" }, otherMembers });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.code, LAST_ADMIN_ERROR_CODE);
});

test("Caso 16: no se puede eliminar (desactivar) el último company_admin válido", () => {
  const target = { user_id: "admin-1", role: "company_admin", status: "active" };
  const otherMembers = [];
  const resultado = guardLastCompanyAdmin({ targetMember: target, changes: { status: "inactive" }, otherMembers });
  assert.equal(resultado.ok, false);
});

test("Caso 17: no se puede cambiar el rol del último company_admin a operator", () => {
  const target = { user_id: "admin-1", role: "company_admin", status: "active" };
  const otherMembers = [{ user_id: "op-1", role: "operator", status: "active" }];
  const resultado = guardLastCompanyAdmin({ targetMember: target, changes: { role: "operator" }, otherMembers });
  assert.equal(resultado.ok, false);
});

test("Caso 18: SÍ se permite la operación cuando existe otro company_admin válido (flujo de reemplazo)", () => {
  const target = { user_id: "admin-1", role: "company_admin", status: "active" };
  const otroAdminYaActivo = [{ user_id: "admin-2", role: "company_admin", status: "active" }];
  const suspender = guardLastCompanyAdmin({ targetMember: target, changes: { status: "suspended" }, otherMembers: otroAdminYaActivo });
  assert.equal(suspender.ok, true);
  const eliminar = guardLastCompanyAdmin({ targetMember: target, changes: { status: "inactive" }, otherMembers: otroAdminYaActivo });
  assert.equal(eliminar.ok, true);
  const cambiarRol = guardLastCompanyAdmin({ targetMember: target, changes: { role: "operator" }, otherMembers: otroAdminYaActivo });
  assert.equal(cambiarRol.ok, true);
});

test("Caso E: Root también queda protegido -- guardLastCompanyAdmin no distingue quién invoca, no hay excepción implícita para Root", () => {
  // La función no recibe ni consulta "quién es el actor" -- es
  // deliberadamente ciega a eso, así que Root pasa por la MISMA regla
  // que cualquier otro caller. El endpoint de activación llama a esta
  // misma función sin excepción para requirePlatformAdmin (ver
  // route.js) -- no existe ningún parámetro de "override" implementado.
  const target = { user_id: "admin-1", role: "company_admin", status: "active" };
  const resultado = guardLastCompanyAdmin({ targetMember: target, changes: { status: "suspended" }, otherMembers: [] });
  assert.equal(resultado.ok, false);
});

test("adicional: un miembro que YA NO era administrador válido hoy nunca dispara esta protección", () => {
  const yaOperador = { user_id: "op-1", role: "operator", status: "active" };
  const resultado = guardLastCompanyAdmin({ targetMember: yaOperador, changes: { status: "suspended" }, otherMembers: [] });
  assert.equal(resultado.ok, true);

  const adminYaSuspendido = { user_id: "admin-1", role: "company_admin", status: "suspended" };
  const reintento = guardLastCompanyAdmin({ targetMember: adminYaSuspendido, changes: { status: "inactive" }, otherMembers: [] });
  assert.equal(reintento.ok, true);
});

test("adicional: isValidCompanyAdmin exige role=company_admin Y status=active -- invited/suspended/inactive no cuentan", () => {
  assert.equal(isValidCompanyAdmin({ role: "company_admin", status: "active" }), true);
  assert.equal(isValidCompanyAdmin({ role: "company_admin", status: "invited" }), false);
  assert.equal(isValidCompanyAdmin({ role: "company_admin", status: "suspended" }), false);
  assert.equal(isValidCompanyAdmin({ role: "company_admin", status: "inactive" }), false);
  assert.equal(isValidCompanyAdmin({ role: "operator", status: "active" }), false);
});

test("adicional: wouldRemoveLastCompanyAdmin ignora el orden -- mismo resultado en cualquier orden del arreglo", () => {
  const a = { role: "company_admin", status: "active" };
  const b = { role: "operator", status: "active" };
  assert.equal(wouldRemoveLastCompanyAdmin({ otherMembers: [b], proposedMember: { ...a, status: "suspended" } }), true);
  assert.equal(wouldRemoveLastCompanyAdmin({ otherMembers: [{ ...a, user_id: "otro" }], proposedMember: { ...a, status: "suspended" } }), false);
});

test("Caso 13: activación queda auditada (activated_at + activated_by se escriben)", () => {
  const now = new Date("2026-09-10T15:00:00Z");
  const resultado = buildActivationUpdate({ action: ACTIVATION_ACTIONS.ACTIVATE_INDEFINITE, actorUserId: "root-uuid-123", now });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.update.activated_by, "root-uuid-123");
  assert.equal(resultado.update.activated_at, now.toISOString());
  assert.equal(resultado.update.status, "active");
  // Una activación limpia cualquier rastro de suspensión previa:
  assert.equal(resultado.update.suspended_at, null);
  assert.equal(resultado.update.suspended_by, null);
});

test("Caso 14: suspensión queda auditada (suspended_at + suspended_by se escriben)", () => {
  const now = new Date("2026-09-10T16:00:00Z");
  const resultado = buildActivationUpdate({ action: ACTIVATION_ACTIONS.SUSPEND, actorUserId: "root-uuid-456", now });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.update.suspended_by, "root-uuid-456");
  assert.equal(resultado.update.suspended_at, now.toISOString());
  assert.equal(resultado.update.status, "suspended");
});

// ============================================================
// Tests adicionales (más allá de los 14 exigidos)
// ============================================================

test("adicional: buildActivationUpdate rechaza cualquier acción sin actorUserId (nunca auto-activación)", () => {
  const resultado = buildActivationUpdate({ action: ACTIVATION_ACTIONS.ACTIVATE_INDEFINITE, actorUserId: null });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.update, null);
});

test("adicional: activación temporal con preset calcula access_expires_at correctamente (+8h)", () => {
  const now = new Date("2026-09-10T09:00:00Z");
  const resultado = buildActivationUpdate({ action: ACTIVATION_ACTIONS.ACTIVATE_TEMPORARY, hours: 8, actorUserId: "root-1", now });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.update.access_expires_at, new Date("2026-09-10T17:00:00Z").toISOString());
});

test("adicional: todos los presets de duración son aceptados y ninguno fuera de la lista lo es", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  for (const horas of ACCESS_DURATION_PRESET_HOURS) {
    const r = computeAccessExpiresAt({ mode: "preset", hours: horas, now });
    assert.equal(r.ok, true, `preset de ${horas}h debería ser válido`);
  }
  const invalido = computeAccessExpiresAt({ mode: "preset", hours: 6, now });
  assert.equal(invalido.ok, false);
});

test("adicional: fecha/hora personalizada debe ser futura", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  const pasada = computeAccessExpiresAt({ mode: "custom", customIso: "2026-09-10T11:00:00Z", now });
  assert.equal(pasada.ok, false);
  const futura = computeAccessExpiresAt({ mode: "custom", customIso: "2026-09-11T00:00:00Z", now });
  assert.equal(futura.ok, true);
});

test("adicional: reactivar exige que el estado actual sea 'suspended'", () => {
  const ok = buildActivationUpdate({ action: ACTIVATION_ACTIONS.REACTIVATE, actorUserId: "root-1", currentStatus: "suspended" });
  assert.equal(ok.ok, true);
  const rechazado = buildActivationUpdate({ action: ACTIVATION_ACTIONS.REACTIVATE, actorUserId: "root-1", currentStatus: "invited" });
  assert.equal(rechazado.ok, false);
});

test("adicional: compatibilidad -- company_admin con product_scope NULL hereda TODOS los productos de su empresa", () => {
  assert.deepEqual(applyProductScope(["OFF_STREET", "ON_STREET"], null), ["OFF_STREET", "ON_STREET"]);
});

test("adicional: compatibilidad -- operator con product_scope NULL conserva el comportamiento actual (sin restricción, igual que antes de esta migración)", () => {
  assert.deepEqual(applyProductScope(["OFF_STREET"], null), ["OFF_STREET"]);
});

test("adicional: product_scope BOTH nunca amplía más allá de lo que la empresa tiene habilitado", () => {
  assert.deepEqual(applyProductScope(["OFF_STREET"], "BOTH"), ["OFF_STREET"]);
});

test("adicional: resolveDefaultProductScope -- company_admin de empresa con ambos productos default BOTH", () => {
  assert.equal(resolveDefaultProductScope({ role: "company_admin", companyEnabledProducts: ["OFF_STREET", "ON_STREET"] }), "BOTH");
});

test("adicional: resolveDefaultProductScope -- company_admin de empresa con un solo producto default a ese producto", () => {
  assert.equal(resolveDefaultProductScope({ role: "company_admin", companyEnabledProducts: ["ON_STREET"] }), "ON_STREET");
});

test("adicional: resolveDefaultProductScope -- operator nunca se infiere automáticamente (debe ser explícito)", () => {
  assert.equal(resolveDefaultProductScope({ role: "operator", companyEnabledProducts: ["OFF_STREET", "ON_STREET"] }), null);
});

test("adicional: crear operador SIN product_scope explícito es rechazado (nunca se adivina)", () => {
  const resultado = validateProductScopeForCreation({ role: "operator", productScope: null, companyEnabledProducts: ["OFF_STREET", "ON_STREET"] });
  assert.equal(resultado.ok, false);
});

test("adicional: operator con BOTH es rechazado por defecto (preferencia: un único producto por operador)", () => {
  const resultado = validateProductScopeForCreation({ role: "operator", productScope: "BOTH", companyEnabledProducts: ["OFF_STREET", "ON_STREET"] });
  assert.equal(resultado.ok, false);
  assert.match(resultado.error, /único producto/i);
});

test("adicional: operator con BOTH SÍ se permite si se declara explícitamente el caso justificado (allowOperatorBoth)", () => {
  const resultado = validateProductScopeForCreation({ role: "operator", productScope: "BOTH", companyEnabledProducts: ["OFF_STREET", "ON_STREET"], allowOperatorBoth: true });
  assert.equal(resultado.ok, true);
});

test("adicional: company_admin puede ser BOTH sin restricción especial", () => {
  const resultado = validateProductScopeForCreation({ role: "company_admin", productScope: "BOTH", companyEnabledProducts: ["OFF_STREET", "ON_STREET"] });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.value, "BOTH");
});

test("adicional: functionLabel -- las 3 etiquetas amigables pedidas por FASE 7/8", () => {
  assert.equal(functionLabel({ role: "company_admin", productScope: "BOTH" }), "Administrador");
  assert.equal(functionLabel({ role: "operator", productScope: "OFF_STREET" }), "Operador Off Street");
  assert.equal(functionLabel({ role: "operator", productScope: "ON_STREET" }), "Inspector On Street");
});

test("adicional: resolveDisplayStatus -- los 5 estados de FASE 5 (ACTIVO/ACTIVO HASTA/SUSPENDIDO/PENDIENTE/VENCIDO)", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  assert.equal(resolveDisplayStatus({ status: "active", accessExpiresAt: null, now }), "active_indefinite");
  assert.equal(resolveDisplayStatus({ status: "active", accessExpiresAt: "2026-09-10T13:00:00Z", now }), "active_until");
  assert.equal(resolveDisplayStatus({ status: "suspended", accessExpiresAt: null, now }), "suspended");
  assert.equal(resolveDisplayStatus({ status: "invited", accessExpiresAt: null, now }), "pending");
  assert.equal(resolveDisplayStatus({ status: "active", accessExpiresAt: "2026-09-10T11:00:00Z", now }), "expired");
});

test("adicional: resolveDisplayStatus 'expired' NUNCA requiere un status='expired' en BD -- sigue siendo 'active' en la fila real", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  const estado = resolveDisplayStatus({ status: "active", accessExpiresAt: "2026-09-01T00:00:00Z", now });
  assert.equal(estado, "expired");
  // La fila en BD sigue con status literal "active" -- lo confirma
  // isMembershipWithinAccessWindow, que es quien realmente bloquea:
  assert.equal(isMembershipWithinAccessWindow({ status: "active", accessExpiresAt: "2026-09-01T00:00:00Z", now }), false);
});

test("adicional: PRODUCT_SCOPES y ACTIVATION_ACTIONS exponen exactamente los valores del CHECK constraint real", () => {
  assert.deepEqual(Object.values(PRODUCT_SCOPES).sort(), ["BOTH", "OFF_STREET", "ON_STREET"]);
  assert.deepEqual(Object.values(ACTIVATION_ACTIONS).sort(), ["activar_indefinido", "activar_temporal", "eliminar", "reactivar", "suspender"]);
});
