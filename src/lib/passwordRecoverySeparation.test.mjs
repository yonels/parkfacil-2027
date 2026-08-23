import assert from "node:assert/strict";
import test from "node:test";

import {
  construirRedirectTo,
  procesarRecuperacionContrasena,
  RESPUESTA_GENERICA,
} from "./passwordRecoveryCore.mjs";

const AUTH_USER = {
  id: "user-operator-1",
  email: "operador1.5q@usuarios.parkfacil.cl",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
  banned_until: null,
  app_metadata: { role: "operator" },
};

function terminal(result) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    lte() { return chain; },
    gte() { return chain; },
    limit() { return Promise.resolve(result); },
    maybeSingle() { return Promise.resolve(result); },
  };
  return chain;
}

function createClientRecoveryMock({
  user = AUTH_USER,
  recoveryEmail = "persona.real@gmail.com",
  member = true,
  company = true,
  contract = true,
} = {}) {
  const generateCalls = [];
  const sent = [];
  const db = {
    auth: {
      admin: {
        async listUsers() {
          return { data: { users: user ? [user] : [] }, error: null };
        },
        async generateLink(args) {
          generateCalls.push(args);
          return {
            data: { properties: { action_link: "https://cliente.parkfacilapp.cl/nueva-contrasena?qa=1" } },
            error: null,
          };
        },
      },
    },
    from(table) {
      if (table === "company_members") {
        return terminal({
          data: member ? { company_id: "emp-5q", role: "operator", status: "active", recovery_email: recoveryEmail } : null,
          error: null,
        });
      }
      if (table === "companies") {
        return terminal({ data: company ? { id: "emp-5q" } : null, error: null });
      }
      if (table === "company_contracts") {
        return terminal({ data: contract ? [{ id: "contract-1" }] : [], error: null });
      }
      throw new Error(`Tabla inesperada: ${table}`);
    },
  };
  const enviarCorreo = async (payload) => sent.push(payload);
  return { db, enviarCorreo, generateCalls, sent };
}

async function requestRecovery(mock, loginIdentifier = AUTH_USER.email) {
  return procesarRecuperacionContrasena({
    portal: "cliente",
    redirectTo: construirRedirectTo("cliente"),
    loginIdentifier,
    supabase: mock.db,
    enviarCorreo: mock.enviarCorreo,
  });
}

test("login interno genera el token para auth.users.email y lo envía al recovery_email asociado", async () => {
  const mock = createClientRecoveryMock();
  const result = await requestRecovery(mock);

  assert.equal(result.status, 200);
  assert.equal(mock.generateCalls[0].email, AUTH_USER.email);
  assert.equal(mock.sent[0].para, "persona.real@gmail.com");
  assert.notEqual(mock.generateCalls[0].email, mock.sent[0].para);
});

test("login y recovery email pueden ser iguales", async () => {
  const realEmailUser = { ...AUTH_USER, email: "persona.real@gmail.com" };
  const mock = createClientRecoveryMock({ user: realEmailUser, recoveryEmail: realEmailUser.email });
  await requestRecovery(mock, realEmailUser.email);

  assert.equal(mock.generateCalls[0].email, realEmailUser.email);
  assert.equal(mock.sent[0].para, realEmailUser.email);
});

test("usuario sin recovery_email o con formato inválido mantiene antienumeración y no genera token", async () => {
  for (const recoveryEmail of [null, "correo-invalido"]) {
    const mock = createClientRecoveryMock({ recoveryEmail });
    const result = await requestRecovery(mock);
    assert.equal(result.mensaje, RESPUESTA_GENERICA);
    assert.equal(mock.generateCalls.length, 0);
    assert.equal(mock.sent.length, 0);
  }
});

test("usuario inexistente y membresía no elegible responden igual", async () => {
  const inexistente = createClientRecoveryMock({ user: null });
  const sinMembresia = createClientRecoveryMock({ member: false });
  const [a, b] = await Promise.all([requestRecovery(inexistente), requestRecovery(sinMembresia)]);

  assert.equal(a.mensaje, RESPUESTA_GENERICA);
  assert.equal(b.mensaje, RESPUESTA_GENERICA);
  assert.equal(inexistente.sent.length, 0);
  assert.equal(sinMembresia.sent.length, 0);
});
