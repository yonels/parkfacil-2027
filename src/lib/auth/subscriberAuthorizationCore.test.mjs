import test from "node:test";
import assert from "node:assert/strict";
import { requireSubscriberRow, subscriberQueryScope } from "./subscriberAuthorizationCore.mjs";

test("platform admin has global subscriber scope", () => assert.deepEqual(subscriberQueryScope({ role: "platform_admin" }), {}));
test("company admin is scoped by company", () => assert.deepEqual(subscriberQueryScope({ role: "company_admin", companyId: "c1" }), { companyId: "c1" }));
test("operator is scoped by company and assigned parkings", () => assert.deepEqual(subscriberQueryScope({ role: "operator", companyId: "c1" }, ["p1"]), { companyId: "c1", parkingIds: ["p1"] }));
test("cross tenant subscriber is hidden", () => assert.throws(() => requireSubscriberRow({ userId: "u1" }, null), (error) => error.status === 404));
