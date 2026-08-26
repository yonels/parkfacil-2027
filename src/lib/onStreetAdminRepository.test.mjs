import test from "node:test";
import assert from "node:assert/strict";
import { resolveParkingCompanyFilter } from "./onStreetDashboardCore.mjs";

// onStreetAdminRepository.js tiene "server-only" (no resoluble bajo
// `node --test`, como el resto de los *Repository.js del proyecto — ver
// usersRepository.js/usersRepositoryCore.mjs). El aislamiento multiempresa
// que scopedParkings aplica se decide en resolveParkingCompanyFilter
// (onStreetDashboardCore.mjs, sin "server-only"), así que se testea ahí
// directamente, sin necesidad de un fake de Supabase.

test("company_admin de Empresa A nunca puede consultar Empresa B, aunque lo intente por parámetro", () => {
  const admin = { role: "company_admin", companyId: "company-a" };
  assert.equal(resolveParkingCompanyFilter(admin), "company-a");
  // Manipular el parámetro companyId (simulando un query param armado a
  // mano) no tiene efecto: el rol no es platform_admin, así que se ignora
  // por completo y se usa siempre context.companyId.
  assert.equal(resolveParkingCompanyFilter(admin, "company-b"), "company-a");
});

test("operator también queda acotado a su propia empresa, sin excepción", () => {
  const operator = { role: "operator", companyId: "company-b" };
  assert.equal(resolveParkingCompanyFilter(operator), "company-b");
  assert.equal(resolveParkingCompanyFilter(operator, "company-a"), "company-b");
});

test("platform_admin ve todas las empresas por defecto (sin filtro)", () => {
  const root = { role: "platform_admin", companyId: null };
  assert.equal(resolveParkingCompanyFilter(root), null);
});

test("platform_admin puede sub-filtrar explícitamente por empresa (selector Root)", () => {
  const root = { role: "platform_admin", companyId: null };
  assert.equal(resolveParkingCompanyFilter(root, "company-b"), "company-b");
});

// Administradores/Operadores On Street (/on-street-qr/administradores,
// /on-street-qr/operadores) reutilizan exactamente esta misma función a
// través de listOnStreetCompanies() para acotar tanto el listado como el
// selector de empresa del formulario "Crear". La creación (POST
// /api/usuarios) y la ficha individual (GET/PATCH /api/usuarios/[id]) no
// se tocaron — siguen protegidas por companyScope/requireCompanyResource,
// ya testeados en apiAuthorizationCore.test.mjs (ahí se prueba
// explícitamente que company_admin de una empresa recibe 404 al intentar
// tocar un recurso de otra).
test("Administradores/Operadores On Street: listOnStreetCompanies nunca expone una empresa ajena a company_admin/operator", () => {
  const adminA = { role: "company_admin", companyId: "company-a" };
  const operatorA = { role: "operator", companyId: "company-a" };
  // Ni manipulando el parámetro (simulando ?companyId=company-b en la URL
  // del endpoint /api/on-street-qr/companies) se obtiene otra empresa.
  assert.equal(resolveParkingCompanyFilter(adminA, "company-b"), "company-a");
  assert.equal(resolveParkingCompanyFilter(operatorA, "company-b"), "company-a");
});
