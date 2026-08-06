import test from "node:test";
import assert from "node:assert/strict";
import { parkingQueryScope, requireAssignedOperator, requireParkingChildRow } from "./parkingAuthorizationCore.mjs";
import { requirePermission } from "./apiAuthorizationCore.mjs";
import { PERMISSIONS } from "./permissions.mjs";

const root = { userId: "root", companyId: null, portal: "root", role: "platform_admin" };
const adminA = { userId: "admin-a", companyId: "company-a", portal: "client", role: "company_admin" };
const operatorA = { userId: "operator-a", companyId: "company-a", portal: "client", role: "operator" };

test("Root conserva alcance global", () => {
  assert.deepEqual(parkingQueryScope(root), { companyId: null, parkingIds: null });
  assert.equal(requirePermission(root, PERMISSIONS.PARKINGS_MANAGE), root);
});

test("company_admin queda filtrado por su empresa", () => {
  assert.deepEqual(parkingQueryScope(adminA), { companyId: "company-a", parkingIds: null });
  assert.equal(requirePermission(adminA, PERMISSIONS.PARKINGS_MANAGE), adminA);
});

test("operator queda limitado a IDs expresamente asignados", () => {
  assert.deepEqual(parkingQueryScope(operatorA, ["parking-a", "parking-a"]), { companyId: "company-a", parkingIds: ["parking-a"] });
  assert.deepEqual(parkingQueryScope(operatorA, []), { companyId: "company-a", parkingIds: [] });
});

test("operator recibe 403 ante escritura aunque tenga parking asignado", () => {
  assert.throws(() => requirePermission(operatorA, PERMISSIONS.PARKINGS_MANAGE), (error) => error.status === 403 && error.code === "PERMISSION_FORBIDDEN");
});

test("un hijo ausente o cruzado se representa como 404", () => {
  assert.throws(() => requireParkingChildRow(adminA, null), (error) => error.status === 404 && error.code === "RESOURCE_NOT_FOUND");
  assert.deepEqual(requireParkingChildRow(adminA, { id: "level-a", parking_id: "parking-a" }), { id: "level-a", parking_id: "parking-a" });
});

test("solo permite asignar operadores activos de la empresa y parking", () => {
  const member = { user_id: "operator-a", company_id: "company-a", role: "operator", status: "active" };
  assert.equal(requireAssignedOperator(adminA, member, { parking_id: "parking-a" }), member);
  assert.throws(() => requireAssignedOperator(adminA, { ...member, company_id: "company-b" }, { parking_id: "parking-a" }), (error) => error.status === 404);
  assert.throws(() => requireAssignedOperator(adminA, member, null), (error) => error.status === 404);
});
