import test from "node:test";
import assert from "node:assert/strict";
import { buildGraphAttachments, buildSendMailPayload, getMicrosoftGraphAccessToken, sendMicrosoftGraphMail, MicrosoftGraphSendError, MicrosoftGraphConfigurationError, sanitizeGraphError } from "./microsoftGraphMailCore.js";

const env = {
  MICROSOFT_TENANT_ID: "tenant-test",
  MICROSOFT_CLIENT_ID: "client-test",
  MICROSOFT_CLIENT_SECRET: "secret-test",
  MICROSOFT_SENDER_EMAIL: "sender@example.com",
};

test("Graph token request is built with client_credentials", async () => {
  let body = "";
  const fetchImpl = async (_url, options) => {
    body = options.body;
    return { ok: true, status: 200, json: async () => ({ access_token: "token-test" }) };
  };
  const token = await getMicrosoftGraphAccessToken({ fetchImpl, env });
  assert.equal(token, "token-test");
  assert.match(body, /grant_type=client_credentials/);
  assert.match(body, /scope=https%3A%2F%2Fgraph\.microsoft\.com%2F\.default/);
});

test("sanitized Graph errors do not expose secrets or access tokens", () => {
  const error = new MicrosoftGraphConfigurationError(["MICROSOFT_CLIENT_SECRET"]);
  const sanitized = sanitizeGraphError(error);
  assert.deepEqual(sanitized.missingVariables, ["MICROSOFT_CLIENT_SECRET"]);
  assert.equal(JSON.stringify(sanitized).includes("secret-test"), false);
  assert.equal(JSON.stringify(sanitized).includes("access_token"), false);
});

test("Graph attachments use fileAttachment", () => {
  const attachments = buildGraphAttachments([{ name: "qr.png", contentType: "image/png", contentBytes: "abc" }]);
  assert.equal(attachments[0]["@odata.type"], "#microsoft.graph.fileAttachment");
  assert.equal(attachments[0].contentBytes, "abc");
});

test("sendMail accepts Graph 202 and 204", async () => {
  for (const status of [202, 204]) {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      if (String(url).includes("login.microsoftonline.com")) return { ok: true, status: 200, json: async () => ({ access_token: "token-test" }) };
      return { ok: true, status, text: async () => "" };
    };
    const result = await sendMicrosoftGraphMail({ para: "user@example.com", asunto: "Test", html: "<p>OK</p>", fetchImpl, env });
    assert.equal(result.ok, true);
    assert.equal(result.status, status);
    assert.match(calls[1].url, /graph\.microsoft\.com\/v1\.0\/users\/sender%40example\.com\/sendMail/);
  }
});

test("sendMail returns controlled Graph errors for 401, 403 and 429", async () => {
  for (const status of [401, 403, 429]) {
    const fetchImpl = async (url) => {
      if (String(url).includes("login.microsoftonline.com")) return { ok: true, status: 200, json: async () => ({ access_token: "token-test" }) };
      return { ok: false, status, text: async () => JSON.stringify({ error: { code: `E${status}`, message: `Graph ${status}` } }) };
    };
    await assert.rejects(() => sendMicrosoftGraphMail({ para: "user@example.com", asunto: "Test", html: "<p>OK</p>", fetchImpl, env }), (error) => {
      assert.equal(error instanceof MicrosoftGraphSendError, true);
      assert.equal(error.status, status);
      assert.equal(error.code, `E${status}`);
      return true;
    });
  }
});

test("missing Microsoft variables are controlled", async () => {
  await assert.rejects(() => sendMicrosoftGraphMail({ para: "user@example.com", asunto: "Test", html: "<p>OK</p>", fetchImpl: async () => {}, env: {} }), MicrosoftGraphConfigurationError);
});

test("payload rejects empty recipients and supports HTML", () => {
  assert.throws(() => buildSendMailPayload({ para: "", asunto: "A", html: "<p>A</p>" }), /destinatario/);
  const payload = buildSendMailPayload({ para: "a@example.com", asunto: "A", html: "<p>A</p>" });
  assert.equal(payload.message.body.contentType, "HTML");
});