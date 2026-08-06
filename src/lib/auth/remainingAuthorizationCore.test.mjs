import test from "node:test";
import assert from "node:assert/strict";
import { notificationScopeClauses } from "./remainingAuthorizationCore.mjs";
import { hasPermission, PERMISSIONS } from "./permissions.mjs";

test("notification scope combines parking, subscriber and own user", () => assert.deepEqual(notificationScopeClauses({ parkingIds: ["p1"], subscriberIds: ["s1"], userId: "u1" }), ["parking_id.in.(p1)", "subscriber_id.in.(s1)", "user_id.eq.u1"]));
test("operator can read but cannot manage coupons", () => { assert.equal(hasPermission("operator", PERMISSIONS.COUPONS_READ), true); assert.equal(hasPermission("operator", PERMISSIONS.COUPONS_MANAGE), false); });
test("company admin can manage coupons", () => assert.equal(hasPermission("company_admin", PERMISSIONS.COUPONS_MANAGE), true));
