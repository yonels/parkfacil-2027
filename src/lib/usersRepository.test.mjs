import test from "node:test";
import assert from "node:assert/strict";
import { mapAuthorizedUsers } from "./usersRepositoryCore.mjs";

test("mapea únicamente los miembros previamente acotados por empresa", () => {
  const data = mapAuthorizedUsers({
    members: [{ user_id: "user-a", company_id: "company-a", full_name: "Usuario A", role: "operator", status: "active" }],
    authUsers: [{ id: "user-a", email: "a@example.cl", user_metadata: {} }, { id: "user-b", email: "b@example.cl", user_metadata: {} }],
    companies: [{ id: "company-a", trade_name: "Empresa A", business_name: "Empresa A SpA", rut_number: "1", rut_dv: "9" }],
    parkings: [{ id: "parking-a", company_id: "company-a", code: "A", name: "Parking A" }, { id: "parking-b", company_id: "company-b", code: "B", name: "Parking B" }],
    access: [{ user_id: "user-a", parking_id: "parking-a" }, { user_id: "user-b", parking_id: "parking-b" }],
  });
  assert.equal(data.length, 1);
  assert.equal(data[0].empresaId, "company-a");
  assert.deepEqual(data[0].estacionamientos, ["parking-a"]);
  assert.equal(JSON.stringify(data).includes("company-b"), false);
  assert.equal(JSON.stringify(data).includes("b@example.cl"), false);
});
