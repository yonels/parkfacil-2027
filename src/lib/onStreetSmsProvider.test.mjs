import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSentralandSmsProvider, resolveSmsProvider, simulatedSmsProvider, sentralandSmsProvider } from "./onStreetSmsProviderCore.mjs";

test("por defecto (sin SMS_PROVIDER) resuelve al proveedor simulado", () => {
  const previous = process.env.SMS_PROVIDER;
  delete process.env.SMS_PROVIDER;
  try {
    assert.equal(resolveSmsProvider(), simulatedSmsProvider);
  } finally {
    if (previous !== undefined) process.env.SMS_PROVIDER = previous;
  }
});

test("SMS_PROVIDER=sentraland resuelve al proveedor real", () => {
  assert.equal(resolveSmsProvider("sentraland"), sentralandSmsProvider);
});

test("un nombre de proveedor desconocido falla explícito en vez de caer silenciosamente al simulado", () => {
  assert.throws(() => resolveSmsProvider("otro-proveedor-inventado"), { code: "SMS_PROVIDER_UNKNOWN" });
});

test("el proveedor simulado envía sin tocar red ni credenciales, y sin checkStatus", async () => {
  const result = await simulatedSmsProvider.send({ to: "+56912345678", message: "hola" });
  assert.equal(result.ok, true);
  assert.match(result.providerMessageId, /^simulated-/);
  assert.equal(simulatedSmsProvider.checkStatus, null);
});

test("el proveedor simulado falla explícito ante un mensaje vacío", async () => {
  const result = await simulatedSmsProvider.send({ to: "+56912345678", message: "" });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "INVALID_MESSAGE");
});

test("el proveedor Sentraland sin SENTRALAND_TIPO_SERVICIO configurado falla explícito al enviar", async () => {
  const previous = { i: process.env.SENTRALAND_INSTITUCION, t: process.env.SENTRALAND_TIPO_SERVICIO, u: process.env.SENTRALAND_USUARIO, p: process.env.SENTRALAND_PASSWORD };
  process.env.SENTRALAND_INSTITUCION = "999";
  process.env.SENTRALAND_TIPO_SERVICIO = "";
  process.env.SENTRALAND_USUARIO = "parkfacil";
  process.env.SENTRALAND_PASSWORD = "secret";
  try {
    await assert.rejects(() => sentralandSmsProvider.send({ to: "+56912345678", message: "hola" }), { code: "SENTRALAND_TIPO_SERVICIO_NOT_CONFIGURED" });
  } finally {
    if (previous.i === undefined) delete process.env.SENTRALAND_INSTITUCION; else process.env.SENTRALAND_INSTITUCION = previous.i;
    if (previous.t === undefined) delete process.env.SENTRALAND_TIPO_SERVICIO; else process.env.SENTRALAND_TIPO_SERVICIO = previous.t;
    if (previous.u === undefined) delete process.env.SENTRALAND_USUARIO; else process.env.SENTRALAND_USUARIO = previous.u;
    if (previous.p === undefined) delete process.env.SENTRALAND_PASSWORD; else process.env.SENTRALAND_PASSWORD = previous.p;
  }
});

test("credenciales nunca expuestas: el núcleo del proveedor no imprime ni loguea password", async () => {
  const source = await readFile(new URL("./onStreetSmsProviderCore.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /NEXT_PUBLIC_/);
  assert.doesNotMatch(source, /console\.(log|error).*password/i);
});

test("el punto de entrada real (onStreetSmsProvider.js) lleva la marca server-only", async () => {
  const source = await readFile(new URL("./onStreetSmsProvider.js", import.meta.url), "utf8");
  assert.match(source, /import "server-only"/);
  assert.match(source, /export \* from ".\/onStreetSmsProviderCore\.mjs"/);
});

test("token expirado por HTTP 401 obtiene uno nuevo y reintenta una sola vez", async () => {
  let tokenCalls = 0, sendCalls = 0;
  const provider = createSentralandSmsProvider({
    getToken: async () => `token-${++tokenCalls}`,
    sendSms: async ({ token }) => { sendCalls += 1; if (sendCalls === 1) throw Object.assign(new Error("401"), { code: "SENTRALAND_HTTP_ERROR", status: 401 }); return { ok: true, code: 0, idmensaje: "m1", description: token }; },
  });
  const result = await provider.send({ to: "+56912345678", message: "hola" });
  assert.equal(result.ok, true);
  assert.equal(tokenCalls, 2);
  assert.equal(sendCalls, 2);
});

test("un 500 o timeout del envio no se reintenta por riesgo de duplicado", async () => {
  for (const failure of [Object.assign(new Error("500"), { code: "SENTRALAND_HTTP_ERROR", status: 500 }), Object.assign(new Error("timeout"), { code: "SENTRALAND_TIMEOUT" })]) {
    let sendCalls = 0;
    const provider = createSentralandSmsProvider({ getToken: async () => "token", sendSms: async () => { sendCalls += 1; throw failure; } });
    await assert.rejects(() => provider.send({ to: "+56912345678", message: "hola" }));
    assert.equal(sendCalls, 1);
  }
});
