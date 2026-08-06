import test from "node:test";
import assert from "node:assert/strict";
import { getPortalFromHost, normalizeHost } from "./portal.mjs";

test("determina Portal Cliente únicamente desde el host cliente", () => {
  assert.equal(getPortalFromHost("cliente.parkfacilapp.cl"), "client");
  assert.equal(getPortalFromHost("cliente.localhost:3000"), "client");
});

test("determina Portal Root para root y desarrollo local", () => {
  assert.equal(getPortalFromHost("root.parkfacilapp.cl"), "root");
  assert.equal(getPortalFromHost("localhost:3000"), "root");
  assert.equal(normalizeHost("ROOT.PARKFACILAPP.CL:443"), "root.parkfacilapp.cl");
});
