import test from "node:test";
import assert from "node:assert/strict";
import { requireOperationRow, requireOwnShift } from "./operationAuthorizationCore.mjs";

test("operator can use own shift", () => assert.equal(requireOwnShift({ role: "operator", userId: "u1" }, { operator_id: "u1" }).operator_id, "u1"));
test("operator cannot discover another shift", () => assert.throws(() => requireOwnShift({ role: "operator", userId: "u1" }, { operator_id: "u2" }), (error) => error.status === 404));
test("admin can resolve a company shift", () => assert.equal(requireOwnShift({ role: "company_admin", userId: "a" }, { operator_id: "u2" }).operator_id, "u2"));
test("missing operation resource is 404", () => assert.throws(() => requireOperationRow({}, null), (error) => error.status === 404));
