import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { formatCompanyRut, loadCompanyIdentity, shapeCompanyIdentity } from "./companyIdentityCore.mjs";

test("formatCompanyRut agrega puntos y guion; sin datos devuelve null", () => {
  assert.equal(formatCompanyRut("4943377", "8"), "4.943.377-8");
  assert.equal(formatCompanyRut(76123456, "k"), "76.123.456-K");
  assert.equal(formatCompanyRut("", "8"), null);
  assert.equal(formatCompanyRut("123", null), null);
});

test("shapeCompanyIdentity: razón social, fantasía distinta y administradores sin duplicados", () => {
  const identity = shapeCompanyIdentity({ business_name: "ParkFacil Operaciones Spa", trade_name: "ParkFacil Operaciones", rut_number: "4943377", rut_dv: "8" }, ["Gloria Caica", " ", "Gloria Caica", null]);
  assert.deepEqual(identity, { businessName: "ParkFacil Operaciones Spa", tradeName: "ParkFacil Operaciones", rut: "4.943.377-8", admins: ["Gloria Caica"] });
  assert.equal(shapeCompanyIdentity({ business_name: "X", trade_name: "X" }).tradeName, null);
  assert.equal(shapeCompanyIdentity(null), null);
});

function fakeDb({ company, members, fail = false }) {
  return {
    from(table) {
      const filters = [];
      const query = {
        select() { return query; },
        eq(column, value) { filters.push([column, value]); return query; },
        maybeSingle: async () => (fail ? { data: null, error: { code: "X" } } : { data: company, error: null }),
        then(resolve) { resolve({ data: table === "company_members" ? members : null, error: null, filters }); },
      };
      return query;
    },
  };
}

test("loadCompanyIdentity lee empresa y administradores activos; ante error devuelve null", async () => {
  const identity = await loadCompanyIdentity(fakeDb({ company: { business_name: "Empresa SpA", rut_number: "1", rut_dv: "9" }, members: [{ full_name: "Ana" }] }), "emp-1");
  assert.deepEqual(identity, { businessName: "Empresa SpA", tradeName: null, rut: "1-9", admins: ["Ana"] });
  assert.equal(await loadCompanyIdentity(fakeDb({ fail: true, members: [] }), "emp-1"), null);
  assert.equal(await loadCompanyIdentity(null, "emp-1"), null);
});

test("Inicio y Dashboard Off Street muestran la identidad de la empresa", async () => {
  const home = await readFile(new URL("../app/page.js", import.meta.url), "utf8");
  assert.ok(home.includes("loadCompanyIdentity") && home.includes("CompanyIdentityCard"));
  const route = await readFile(new URL("../app/api/dashboard-off-street/route.js", import.meta.url), "utf8");
  assert.ok(route.includes("companyIdentity") && route.includes("loadCompanyIdentity"));
  const dashboard = await readFile(new URL("../app/dashboard-off-street/page.js", import.meta.url), "utf8");
  assert.ok(dashboard.includes("CompanyIdentityCard"));
});
