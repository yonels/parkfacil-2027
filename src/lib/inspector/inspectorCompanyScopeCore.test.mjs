import test from "node:test";
import assert from "node:assert/strict";
import {
  IMPOSSIBLE_ID,
  buildInspectorCompanyScope,
  inspectionRowInScope,
  inspectionScopeOrFilter,
  parkingInScope,
  scopeParkingIds,
} from "./inspectorCompanyScopeCore.mjs";

const scope = buildInspectorCompanyScope({ companyId: "emp-001", parkingIds: ["p1", "p2", "p1", ""], inspectorUserIds: ["u1"] });

test("el scope limpia duplicados y vacíos", () => {
  assert.deepEqual(scope.parkingIds, ["p1", "p2"]);
  assert.deepEqual(scope.inspectorUserIds, ["u1"]);
});

test("fail-closed: sin empresa o sin estacionamientos usa un id imposible, nunca todos", () => {
  assert.deepEqual(scopeParkingIds(null), [IMPOSSIBLE_ID]);
  assert.deepEqual(scopeParkingIds({ companyId: "emp-001", parkingIds: [] }), [IMPOSSIBLE_ID]);
  assert.deepEqual(scopeParkingIds({ companyId: null, parkingIds: ["p1"] }), [IMPOSSIBLE_ID]);
  assert.deepEqual(scopeParkingIds(scope), ["p1", "p2"]);
});

test("filtro de fiscalizaciones: estacionamiento de la empresa o inspector de la empresa", () => {
  assert.equal(inspectionScopeOrFilter(scope), 'parking_id.in.("p1","p2"),inspector_user_id.in.("u1")');
  assert.equal(inspectionScopeOrFilter(undefined), `parking_id.in.("${IMPOSSIBLE_ID}"),inspector_user_id.in.("${IMPOSSIBLE_ID}")`);
});

test("parkingInScope e inspectionRowInScope rechazan lo de otra empresa", () => {
  assert.equal(parkingInScope(scope, "p1"), true);
  assert.equal(parkingInScope(scope, "otra"), false);
  assert.equal(parkingInScope(null, "p1"), false);
  assert.equal(inspectionRowInScope(scope, { parking_id: "p2", inspector_user_id: "x" }), true);
  assert.equal(inspectionRowInScope(scope, { parking_id: null, inspector_user_id: "u1" }), true);
  assert.equal(inspectionRowInScope(scope, { parking_id: "otra", inspector_user_id: "x" }), false);
  assert.equal(inspectionRowInScope(null, { parking_id: "p1" }), false);
});
