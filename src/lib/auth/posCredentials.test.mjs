import test from "node:test";
import assert from "node:assert/strict";
import { getPosCredentialClient } from "./posCredentials.mjs";
import { getProductLoginDestination } from "./loginDestination.mjs";

test("remember is unavailable without a native credential channel", () => {
  assert.equal(getPosCredentialClient(undefined), null);
  assert.equal(getPosCredentialClient({}), null);
});
test("native replies are correlated and credentials are passed only to the native channel", async () => {
  const requests = [];
  const channel = { postMessage(raw) { requests.push(JSON.parse(raw)); } };
  const client = getPosCredentialClient(channel);
  assert.equal(getPosCredentialClient(channel), client);
  const reading = client("read");
  const saving = client("save", { username: "operador", password: "test-only" });
  channel.onmessage({ data: "invalid" });
  channel.onmessage({ data: JSON.stringify({ id: "unknown", ok: true }) });
  channel.onmessage({ data: JSON.stringify({ id: requests[1].id, ok: true, data: { saved: true } }) });
  channel.onmessage({ data: JSON.stringify({ id: requests[0].id, ok: true, data: null }) });
  assert.equal(await reading, null);
  assert.deepEqual(await saving, { saved: true });
  assert.equal(requests[1].password, "test-only");
});
test("native errors do not expose the credential payload", async () => {
  const channel = { postMessage(raw) { const req = JSON.parse(raw); queueMicrotask(() => channel.onmessage({ data: JSON.stringify({ id: req.id, ok: false, error: "sensitive" }) })); } };
  await assert.rejects(getPosCredentialClient(channel)("forget"), (error) => !error.message.includes("sensitive"));
});
test("company admin with Off Street opens dashboard, operator preserves operational destination", () => {
  const data = { portal: "cliente", destination: "/", enabledProducts: ["OFF_STREET"] };
  assert.equal(getProductLoginDestination({ ...data, role: "company_admin" }), "/dashboard-off-street");
  assert.equal(getProductLoginDestination({ ...data, role: "operator" }), "/estacionamientos");
  assert.equal(getProductLoginDestination({ ...data, portal: "terminal", destination: "/pos" }), "/pos");
  assert.equal(getProductLoginDestination({ ...data, role: "company_admin", destination: "/reportes-off-street" }), "/reportes-off-street");
  assert.equal(getProductLoginDestination({ ...data, enabledProducts: ["OFF_STREET", "ON_STREET"] }), "/");
  assert.equal(getProductLoginDestination({ ...data, enabledProducts: ["ON_STREET"] }), "/on-street-qr");
});
