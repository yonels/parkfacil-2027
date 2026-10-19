import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { couponsEnabled, couponsVisible, COUPONS_DISABLED_ERROR } from "./couponsAvailability.mjs";
import { canAccessPath, navigationVisibleForRole, PRODUCTS, ROLES } from "../auth/permissions.mjs";

test("coupons are off in production unless COUPONS_ENABLED=true, on in preview and local", () => {
  assert.equal(couponsEnabled({ VERCEL_ENV: "production" }), false);
  assert.equal(couponsEnabled({ VERCEL_ENV: "production", COUPONS_ENABLED: "true" }), true);
  assert.equal(couponsEnabled({ VERCEL_ENV: "production", COUPONS_ENABLED: " TRUE " }), true);
  assert.equal(couponsEnabled({ VERCEL_ENV: "preview" }), true);
  assert.equal(couponsEnabled({}), true);
  assert.equal(couponsEnabled({ VERCEL_ENV: "preview", COUPONS_ENABLED: "false" }), false);
});

test("build value: only an explicit false hides coupons", () => {
  assert.equal(couponsVisible("false"), false);
  assert.equal(couponsVisible("true"), true);
  assert.equal(couponsVisible(undefined), true);
  assert.equal(couponsVisible(""), true);
  assert.equal(COUPONS_DISABLED_ERROR.code, "COUPONS_DISABLED");
});

const admin = { portal: "client", role: ROLES.COMPANY_ADMIN, enabledProducts: [PRODUCTS.OFF_STREET] };
const root = { portal: "root", role: ROLES.PLATFORM_ADMIN, enabledProducts: [] };

function withBuildFlag(value, fn) {
  const previous = process.env.NEXT_PUBLIC_COUPONS_ENABLED;
  if (value === undefined) delete process.env.NEXT_PUBLIC_COUPONS_ENABLED;
  else process.env.NEXT_PUBLIC_COUPONS_ENABLED = value;
  try { fn(); } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_COUPONS_ENABLED;
    else process.env.NEXT_PUBLIC_COUPONS_ENABLED = previous;
  }
}

test("hidden build: /cupones is blocked for the company admin and Root, menu item hidden", () => {
  withBuildFlag("false", () => {
    assert.equal(canAccessPath(admin, "/cupones"), false);
    assert.equal(canAccessPath(root, "/cupones"), false);
    assert.equal(navigationVisibleForRole({ href: "/cupones" }, admin), false);
    assert.equal(canAccessPath(admin, "/pago-liberado"), true);
  });
});

test("enabled build (QA/local): /cupones stays available as before", () => {
  withBuildFlag("true", () => {
    assert.equal(canAccessPath(admin, "/cupones"), true);
    assert.equal(canAccessPath(root, "/cupones"), true);
  });
  withBuildFlag(undefined, () => assert.equal(canAccessPath(admin, "/cupones"), true));
});

test("next.config fixes NEXT_PUBLIC_COUPONS_ENABLED from couponsEnabled at build time", () => {
  const config = readFileSync(new URL("../../../next.config.mjs", import.meta.url), "utf8");
  assert.match(config, /NEXT_PUBLIC_COUPONS_ENABLED: String\(couponsEnabled\(process\.env\)\)/);
});

test("every coupons API handler refuses with 403 when coupons are disabled", () => {
  for (const path of ["route.js", "comercios/route.js", "enviar/route.js", "lote/route.js"]) {
    const source = readFileSync(new URL(`../../app/api/cupones/${path}`, import.meta.url), "utf8");
    const handlers = source.match(/export async function \w+\([^)]*\) \{\r?\n/g) || [];
    const guards = source.match(/\n {2}if \(!couponsEnabled\(\)\) return NextResponse\.json\(COUPONS_DISABLED_ERROR, \{ status: 403 \}\);\r?\n/g) || [];
    assert.ok(handlers.length > 0, path);
    assert.equal(guards.length, handlers.length, path);
  }
});
