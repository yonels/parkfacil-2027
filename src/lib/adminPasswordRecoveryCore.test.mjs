import assert from "node:assert/strict";
import test from "node:test";

import {
  AdminRecoverySendError,
  enviarRecuperacionAdministrativa,
} from "./adminPasswordRecoveryCore.mjs";

function crearSupabaseMock({ errorGenerateLink = null, throwOnGenerateLink = null, actionLink = "https://cliente.parkfacilapp.cl/nueva-contrasena?token=abc" } = {}) {
  let generateLinkCalls = 0;

  return {
    get generateLinkCalls() {
      return generateLinkCalls;
    },
    auth: {
      admin: {
        async generateLink(args) {
          generateLinkCalls += 1;
          this.lastArgs = args;

          if (throwOnGenerateLink) throw throwOnGenerateLink;
          if (errorGenerateLink) return { data: null, error: errorGenerateLink };

          return { data: { properties: { action_link: actionLink } }, error: null };
        },
      },
    },
  };
}

function crearEnviarCorreoMock({ throwError = null } = {}) {
  const llamadas = [];
  const enviarCorreo = async (datos) => {
    llamadas.push(datos);
    if (throwError) throw throwError;
    return { ok: true };
  };
  enviarCorreo.llamadas = llamadas;
  return enviarCorreo;
}

test("envía el correo real usando generateLink + Microsoft Graph, apuntando al portal cliente", async () => {
  const supabase = crearSupabaseMock();
  const enviarCorreo = crearEnviarCorreoMock();

  const resultado = await enviarRecuperacionAdministrativa({
    supabase,
    enviarCorreo,
    loginEmail: "operador@usuarios.parkfacil.cl",
    recoveryEmail: "persona@gmail.com",
  });

  assert.deepEqual(resultado, { ok: true });
  assert.equal(enviarCorreo.llamadas.length, 1);
  assert.equal(enviarCorreo.llamadas[0].para, "persona@gmail.com");
  assert.equal(supabase.auth.admin.lastArgs.email, "operador@usuarios.parkfacil.cl");
  assert.match(enviarCorreo.llamadas[0].html, /token=abc/);
  assert.equal(supabase.generateLinkCalls, 1);
});

test("apunta al portal root cuando se solicita explícitamente", async () => {
  const supabase = crearSupabaseMock();
  const enviarCorreo = crearEnviarCorreoMock();

  await enviarRecuperacionAdministrativa({
    supabase,
    enviarCorreo,
    loginEmail: "root@parkfacilapp.cl",
    recoveryEmail: "root@parkfacilapp.cl",
    portalDestino: "root",
  });

  assert.match(supabase.auth.admin.lastArgs.options.redirectTo, /root\.parkfacilapp\.cl/);
});

test("no reporta éxito si Supabase falla al generar el enlace", async () => {
  const supabase = crearSupabaseMock({ errorGenerateLink: { name: "AuthApiError", message: "fallo" } });
  const enviarCorreo = crearEnviarCorreoMock();

  await assert.rejects(
    () => enviarRecuperacionAdministrativa({ supabase, enviarCorreo, loginEmail: "x@usuarios.parkfacil.cl", recoveryEmail: "x@empresa.cl" }),
    AdminRecoverySendError
  );
  assert.equal(enviarCorreo.llamadas.length, 0);
});

test("no reporta éxito si Microsoft Graph rechaza el envío", async () => {
  const supabase = crearSupabaseMock();
  const enviarCorreo = crearEnviarCorreoMock({
    throwError: Object.assign(new Error("Graph rechazó el envío"), { name: "MicrosoftGraphSendError", status: 403 }),
  });

  await assert.rejects(
    () => enviarRecuperacionAdministrativa({ supabase, enviarCorreo, loginEmail: "x@usuarios.parkfacil.cl", recoveryEmail: "x@empresa.cl" }),
    AdminRecoverySendError
  );
});

test("propaga un error controlado si la excepción de generateLink no es un objeto de error de Supabase", async () => {
  const supabase = crearSupabaseMock({ throwOnGenerateLink: new Error("fetch failed") });
  const enviarCorreo = crearEnviarCorreoMock();

  await assert.rejects(
    () => enviarRecuperacionAdministrativa({ supabase, enviarCorreo, loginEmail: "x@usuarios.parkfacil.cl", recoveryEmail: "x@empresa.cl" }),
    AdminRecoverySendError
  );
  assert.equal(enviarCorreo.llamadas.length, 0);
});

test("rechaza recovery_email ausente o inválido antes de generar un token", async () => {
  for (const recoveryEmail of [null, "no-es-email"]) {
    const supabase = crearSupabaseMock();
    await assert.rejects(
      () => enviarRecuperacionAdministrativa({
        supabase,
        enviarCorreo: crearEnviarCorreoMock(),
        loginEmail: "operador@usuarios.parkfacil.cl",
        recoveryEmail,
      }),
      { code: "RECOVERY_EMAIL_MISSING" },
    );
    assert.equal(supabase.generateLinkCalls, 0);
  }
});
