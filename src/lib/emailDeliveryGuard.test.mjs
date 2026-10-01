import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EMAIL_DELIVERY_DISABLED_CODE, isEmailDeliveryDisabled } from "./emailDeliveryGuard.mjs";
import { getMicrosoftGraphAccessToken, sendMicrosoftGraphMail } from "./microsoftGraphMailCore.js";

const graphEnv = { MICROSOFT_TENANT_ID: "t", MICROSOFT_CLIENT_ID: "c", MICROSOFT_CLIENT_SECRET: "s", MICROSOFT_SENDER_EMAIL: "no-reply@example.test" };

test("EMAIL_DELIVERY=disabled (sin importar mayúsculas/espacios) bloquea; ausente u otro valor no", () => {
  assert.equal(isEmailDeliveryDisabled({ EMAIL_DELIVERY: "disabled" }), true);
  assert.equal(isEmailDeliveryDisabled({ EMAIL_DELIVERY: " DISABLED " }), true);
  assert.equal(isEmailDeliveryDisabled({}), false);
  assert.equal(isEmailDeliveryDisabled({ EMAIL_DELIVERY: "enabled" }), false);
});

test("bloqueado: ni token ni envío llegan a la red (fetch nunca se llama)", async () => {
  let llamadas = 0;
  const fetchImpl = async () => { llamadas += 1; throw new Error("no debe llamarse"); };
  const env = { ...graphEnv, EMAIL_DELIVERY: "disabled" };
  await assert.rejects(getMicrosoftGraphAccessToken({ fetchImpl, env }), (error) => error.code === EMAIL_DELIVERY_DISABLED_CODE && error.status === 503);
  await assert.rejects(
    sendMicrosoftGraphMail({ para: ["a@example.test"], asunto: "x", html: "<p>x</p>", fetchImpl, env }),
    (error) => error.code === EMAIL_DELIVERY_DISABLED_CODE
  );
  assert.equal(llamadas, 0);
});

test("habilitado: el flujo existente sigue llamando a Microsoft Graph", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    if (String(url).includes("/oauth2/")) return { ok: true, status: 200, json: async () => ({ access_token: "tok" }) };
    return { ok: true, status: 202, text: async () => "", json: async () => ({}) };
  };
  await sendMicrosoftGraphMail({ para: ["a@example.test"], asunto: "x", html: "<p>x</p>", fetchImpl, env: graphEnv });
  assert.ok(urls.some((u) => u.includes("login.microsoftonline.com")));
  assert.ok(urls.some((u) => u.includes("/sendMail")));
});

test("mailService: el corte está en obtenerTokenMicrosoftGraph, antes de su fetch, y envío/lectura pasan por él", () => {
  const source = readFileSync(new URL("./mailService.js", import.meta.url), "utf8");
  const tokenFn = source.slice(source.indexOf("export async function obtenerTokenMicrosoftGraph"));
  assert.ok(tokenFn.indexOf("isEmailDeliveryDisabled()") > 0 && tokenFn.indexOf("isEmailDeliveryDisabled()") < tokenFn.indexOf("await fetch("));
  const envio = source.slice(source.indexOf("export async function enviarCorreoMicrosoft"), source.indexOf("export async function obtenerMensajeMicrosoftGraph"));
  assert.ok(envio.indexOf("await obtenerTokenMicrosoftGraph()") < envio.indexOf("await fetch("));
  const lectura = source.slice(source.indexOf("export async function obtenerMensajeMicrosoftGraph"));
  assert.ok(lectura.indexOf("await obtenerTokenMicrosoftGraph()") < lectura.indexOf("await fetch("));
});
