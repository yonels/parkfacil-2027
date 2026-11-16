import test from "node:test";
import assert from "node:assert/strict";
import {
  canStartImpersonation,
  isCompanyImpersonable,
  buildImpersonatedContext,
  isImpersonating,
  buildImpersonationHandoffUrl,
  buildRootReturnUrl,
  signImpersonationCookie,
  verifyImpersonationCookie,
} from "./impersonationCore.mjs";

const SECRET = "a".repeat(32); // >= 32 bytes, igual al mínimo real exigido

test("Caso 19: un usuario normal (company_admin/operator) no puede iniciar impersonación", () => {
  assert.equal(canStartImpersonation({ realRole: "company_admin", realPortal: "client" }), false);
  assert.equal(canStartImpersonation({ realRole: "operator", realPortal: "client" }), false);
});

test("Caso 20: Root (platform_admin en portal root) sí puede iniciar impersonación", () => {
  assert.equal(canStartImpersonation({ realRole: "platform_admin", realPortal: "root" }), true);
});

test("un platform_admin fuera del portal root (caso anómalo) no puede iniciar impersonación", () => {
  assert.equal(canStartImpersonation({ realRole: "platform_admin", realPortal: "client" }), false);
});

test("Caso 21: Root puede impersonar una empresa en cualquier status (onboarding incluido)", () => {
  assert.equal(isCompanyImpersonable({ id: "emp-1", status: "onboarding", relationship_type: "client" }), true);
  assert.equal(isCompanyImpersonable({ id: "emp-1", status: "inactive", relationship_type: "client" }), true);
  assert.equal(isCompanyImpersonable({ id: "emp-1", status: "active", relationship_type: "client" }), true);
});

test("solo empresas relationship_type=client son impersonables (no operator/administrator/partner/supplier)", () => {
  assert.equal(isCompanyImpersonable({ id: "emp-1", status: "active", relationship_type: "operator" }), false);
  assert.equal(isCompanyImpersonable(null), false);
});

test("Caso 22: el contexto impersonado queda limitado exactamente al company_id elegido", () => {
  const context = buildImpersonatedContext({
    realUserId: "root-1",
    realEmail: "root@parkfacil.cl",
    portal: "client",
    company: { id: "emp-parkfacil", status: "onboarding", relationship_type: "client", enabled_products: ["OFF_STREET", "ON_STREET"] },
  });
  assert.equal(context.companyId, "emp-parkfacil");
  assert.equal(context.membership.companyId, "emp-parkfacil");
});

test("Caso 23: la identidad real de Root se conserva en el contexto impersonado (para auditoría)", () => {
  const context = buildImpersonatedContext({
    realUserId: "root-1",
    realEmail: "root@parkfacil.cl",
    portal: "client",
    company: { id: "emp-1", status: "active", relationship_type: "client" },
  });
  // userId (usado por activated_by/suspended_by/etc.) sigue siendo el
  // Root real -- NUNCA se inventa un id de company_admin distinto.
  assert.equal(context.userId, "root-1");
  assert.equal(context.realUserId, "root-1");
  assert.equal(context.realRole, "platform_admin");
  assert.equal(context.impersonating, true);
});

test("el rol efectivo durante la impersonación es company_admin (permisos plenos de la empresa), pero realRole sigue siendo platform_admin", () => {
  const context = buildImpersonatedContext({ realUserId: "root-1", portal: "client", company: { id: "emp-1", relationship_type: "client" } });
  assert.equal(context.role, "company_admin");
  assert.equal(context.realRole, "platform_admin");
});

test("isImpersonating distingue contextos normales de impersonados", () => {
  assert.equal(isImpersonating({ impersonating: true }), true);
  assert.equal(isImpersonating({ role: "company_admin" }), false);
  assert.equal(isImpersonating(null), false);
});

test("buildImpersonationHandoffUrl: producción usa cliente.parkfacilapp.cl, el token va en el fragmento (#), nunca en query", () => {
  const url = buildImpersonationHandoffUrl({ currentHost: "root.parkfacilapp.cl", companyId: "emp-1", accessToken: "tok.123" });
  assert.equal(url.startsWith("https://cliente.parkfacilapp.cl/impersonar#"), true);
  assert.ok(url.includes("access_token=tok.123"));
  assert.ok(!url.includes("?"));
});

test("buildImpersonationHandoffUrl: local usa cliente.localhost preservando el puerto", () => {
  const url = buildImpersonationHandoffUrl({ currentHost: "root.localhost:3000", companyId: "emp-1", accessToken: "tok" });
  assert.equal(url.startsWith("http://cliente.localhost:3000/impersonar#"), true);
});

test("buildRootReturnUrl: producción y local", () => {
  assert.equal(buildRootReturnUrl("cliente.parkfacilapp.cl"), "https://root.parkfacilapp.cl/empresas");
  assert.equal(buildRootReturnUrl("cliente.localhost:3000"), "http://root.localhost:3000/empresas");
});

// ============================================================
// Firma HMAC de la cookie de impersonación
// ============================================================

test("cookie válida (recién firmada) permite impersonación", () => {
  const cookie = signImpersonationCookie({ secret: SECRET, rootUserId: "root-1", companyId: "emp-1" });
  const resultado = verifyImpersonationCookie({ secret: SECRET, rootUserId: "root-1", cookieValue: cookie });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.companyId, "emp-1");
});

test("cookie modificada/reconstruida manualmente (firma inventada) es rechazada", () => {
  const cookieFalsa = `emp-1.${Date.now()}.${"0".repeat(64)}`;
  const resultado = verifyImpersonationCookie({ secret: SECRET, rootUserId: "root-1", cookieValue: cookieFalsa });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.reason, "SIGNATURE_MISMATCH");
});

test("cookie con formato corrupto (no 3 partes, o firma que no es hex de 64) se rechaza sin lanzar", () => {
  assert.equal(verifyImpersonationCookie({ secret: SECRET, rootUserId: "root-1", cookieValue: "solo-un-valor" }).ok, false);
  assert.equal(verifyImpersonationCookie({ secret: SECRET, rootUserId: "root-1", cookieValue: "emp-1.123.no-es-hex" }).ok, false);
});

test("cookie de otra empresa no puede reutilizarse cambiando company_id -- invalida la firma", () => {
  const cookie = signImpersonationCookie({ secret: SECRET, rootUserId: "root-1", companyId: "emp-autorizada" });
  const [, issuedAt, firma] = cookie.split(".");
  const cookieManipulada = `emp-otra-empresa.${issuedAt}.${firma}`; // mismo issuedAt/firma, company_id cambiado a mano
  const resultado = verifyImpersonationCookie({ secret: SECRET, rootUserId: "root-1", cookieValue: cookieManipulada });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.reason, "SIGNATURE_MISMATCH");
});

test("una cookie firmada para el Root A no es válida bajo el token verificado de un Root B distinto (revocación implícita por identidad)", () => {
  const cookie = signImpersonationCookie({ secret: SECRET, rootUserId: "root-A", companyId: "emp-1" });
  const resultado = verifyImpersonationCookie({ secret: SECRET, rootUserId: "root-B", cookieValue: cookie });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.reason, "SIGNATURE_MISMATCH");
});

test("expiración: una cookie firmada hace más de maxAgeMs deja de ser válida", () => {
  const haceUnaHora = Date.now() - 60 * 60 * 1000;
  const cookie = signImpersonationCookie({ secret: SECRET, rootUserId: "root-1", companyId: "emp-1", issuedAt: haceUnaHora });
  const resultado = verifyImpersonationCookie({ secret: SECRET, rootUserId: "root-1", cookieValue: cookie, maxAgeMs: 55 * 60 * 1000 });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.reason, "EXPIRED");
});

test("expiración: una cookie vigente (dentro de maxAgeMs) sigue siendo válida", () => {
  const hace10Minutos = Date.now() - 10 * 60 * 1000;
  const cookie = signImpersonationCookie({ secret: SECRET, rootUserId: "root-1", companyId: "emp-1", issuedAt: hace10Minutos });
  const resultado = verifyImpersonationCookie({ secret: SECRET, rootUserId: "root-1", cookieValue: cookie, maxAgeMs: 55 * 60 * 1000 });
  assert.equal(resultado.ok, true);
});

test("un issuedAt en el futuro (reloj manipulado) también se rechaza", () => {
  const enUnaHora = Date.now() + 60 * 60 * 1000;
  const cookie = signImpersonationCookie({ secret: SECRET, rootUserId: "root-1", companyId: "emp-1", issuedAt: enUnaHora });
  const resultado = verifyImpersonationCookie({ secret: SECRET, rootUserId: "root-1", cookieValue: cookie });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.reason, "EXPIRED");
});

test("sin secreto configurado (< 32 bytes), firmar/verificar lanza explícitamente -- nunca continúa en silencio como si no hubiera impersonación", () => {
  assert.throws(() => signImpersonationCookie({ secret: "corto", rootUserId: "root-1", companyId: "emp-1" }), /IMPERSONATION_HMAC_SECRET_NOT_CONFIGURED/);
  assert.throws(() => verifyImpersonationCookie({ secret: "", rootUserId: "root-1", cookieValue: "a.1.b" }), /IMPERSONATION_HMAC_SECRET_NOT_CONFIGURED/);
});

test("revocación: tras 'salir' no hay cookie que verificar -- verifyImpersonationCookie sin cookieValue se rechaza de forma segura", () => {
  const resultado = verifyImpersonationCookie({ secret: SECRET, rootUserId: "root-1", cookieValue: "" });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.reason, "MISSING_INPUT");
});
