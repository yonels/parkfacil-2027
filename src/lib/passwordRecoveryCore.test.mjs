import assert from "node:assert/strict";
import test from "node:test";

import {
  CANAL_ENTREGA_MAILPIT,
  CANAL_ENTREGA_MICROSOFT,
  anonimizarEmail,
  construirRedirectTo,
  detectarPortal,
  esEntornoLocal,
  procesarRecuperacionContrasena,
  resolverCanalEntregaRecuperacion,
  respuestaError,
  respuestaGenerica,
} from "./passwordRecoveryCore.mjs";

const REDIRECT_ROOT = construirRedirectTo("root");
const REDIRECT_LOCAL = "http://localhost:3000/nueva-contrasena";

const USUARIO_ROOT_ELEGIBLE = {
  id: "user-root-1",
  email: "root@parkfacilapp.cl",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
  banned_until: null,
  app_metadata: { role: "platform_admin" },
};

const USUARIO_NO_ELEGIBLE = {
  id: "user-2",
  email: "operador@parkfacilapp.cl",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
  banned_until: null,
  app_metadata: { role: "operator" },
};

function crearSupabaseMock({
  usuarios = [],
  rootRecoveryEmail = "root@parkfacilapp.cl",
  throwOnListUsers = null,
  errorGenerateLink = null,
  throwOnGenerateLink = null,
  actionLink = "https://root.parkfacilapp.cl/nueva-contrasena?token=abc",
  errorResetPasswordForEmail = null,
  throwOnResetPasswordForEmail = null,
} = {}) {
  let listUsersCalls = 0;
  let generateLinkCalls = 0;
  let lastGenerateLinkArgs = null;
  let resetPasswordForEmailCalls = 0;
  let lastResetPasswordForEmailArgs = null;

  return {
    calls: {
      get listUsers() {
        return listUsersCalls;
      },
      get generateLink() {
        return generateLinkCalls;
      },
      get lastGenerateLinkArgs() {
        return lastGenerateLinkArgs;
      },
      get resetPasswordForEmail() {
        return resetPasswordForEmailCalls;
      },
      get lastResetPasswordForEmailArgs() {
        return lastResetPasswordForEmailArgs;
      },
    },
    auth: {
      async resetPasswordForEmail(email, options) {
        resetPasswordForEmailCalls += 1;
        lastResetPasswordForEmailArgs = { email, options };

        if (throwOnResetPasswordForEmail) {
          throw throwOnResetPasswordForEmail;
        }

        if (errorResetPasswordForEmail) {
          return { data: null, error: errorResetPasswordForEmail };
        }

        return { data: {}, error: null };
      },
      admin: {
        async listUsers() {
          listUsersCalls += 1;

          if (throwOnListUsers) {
            throw throwOnListUsers;
          }

          return { data: { users: usuarios }, error: null };
        },
        async generateLink(args) {
          generateLinkCalls += 1;
          lastGenerateLinkArgs = args;

          if (throwOnGenerateLink) {
            throw throwOnGenerateLink;
          }

          if (errorGenerateLink) {
            return { data: null, error: errorGenerateLink };
          }

          return {
            data: { properties: { action_link: actionLink } },
            error: null,
          };
        },
      },
    },
    from(table) {
      assert.equal(table, "platform_admin_profiles");
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        async maybeSingle() {
          return { data: rootRecoveryEmail === undefined ? null : { recovery_email: rootRecoveryEmail }, error: null };
        },
      };
      return chain;
    },
  };
}

function crearEnviarCorreoMock({ throwError = null } = {}) {
  const llamadas = [];

  const enviarCorreo = async (datos) => {
    llamadas.push(datos);

    if (throwError) {
      throw throwError;
    }

    return { ok: true };
  };

  enviarCorreo.llamadas = llamadas;

  return enviarCorreo;
}

// 1. Solicitud válida con usuario existente y elegible.
test("solicitud válida con usuario root elegible envía el correo y responde éxito", async () => {
  const supabase = crearSupabaseMock({ usuarios: [USUARIO_ROOT_ELEGIBLE] });
  const enviarCorreo = crearEnviarCorreoMock();

  const resultado = await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_ROOT,
    email: "Root@ParkFacilApp.cl",
    supabase,
    enviarCorreo,
    canalEntrega: CANAL_ENTREGA_MICROSOFT,
  });

  assert.deepEqual(resultado, respuestaGenerica());
  assert.equal(enviarCorreo.llamadas.length, 1);
  assert.equal(enviarCorreo.llamadas[0].para, "root@parkfacilapp.cl");
  assert.match(enviarCorreo.llamadas[0].html, /token=abc/);
});

// 2. Usuario existente pero no elegible para el portal solicitado.
test("usuario existente pero no elegible responde genérico sin enviar correo", async () => {
  const supabase = crearSupabaseMock({ usuarios: [USUARIO_NO_ELEGIBLE] });
  const enviarCorreo = crearEnviarCorreoMock();

  const resultado = await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_ROOT,
    email: USUARIO_NO_ELEGIBLE.email,
    supabase,
    enviarCorreo,
    canalEntrega: CANAL_ENTREGA_MICROSOFT,
  });

  assert.deepEqual(resultado, respuestaGenerica());
  assert.equal(enviarCorreo.llamadas.length, 0);
  assert.equal(supabase.calls.generateLink, 0);
});

// 3. Usuario inexistente.
test("usuario inexistente responde genérico sin enviar correo (antienumeración)", async () => {
  const supabase = crearSupabaseMock({ usuarios: [] });
  const enviarCorreo = crearEnviarCorreoMock();

  const resultado = await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_ROOT,
    email: "no-existe@parkfacilapp.cl",
    supabase,
    enviarCorreo,
    canalEntrega: CANAL_ENTREGA_MICROSOFT,
  });

  assert.deepEqual(resultado, respuestaGenerica());
  assert.equal(enviarCorreo.llamadas.length, 0);
  assert.equal(supabase.calls.generateLink, 0);
});

test("Root sin recovery_email o con recovery inválido responde genérico sin generar token", async () => {
  for (const rootRecoveryEmail of [null, "correo-invalido"]) {
    const supabase = crearSupabaseMock({ usuarios: [USUARIO_ROOT_ELEGIBLE], rootRecoveryEmail });
    const enviarCorreo = crearEnviarCorreoMock();
    const resultado = await procesarRecuperacionContrasena({
      portal: "root",
      redirectTo: REDIRECT_ROOT,
      loginIdentifier: USUARIO_ROOT_ELEGIBLE.email,
      supabase,
      enviarCorreo,
      canalEntrega: CANAL_ENTREGA_MICROSOFT,
    });
    assert.deepEqual(resultado, respuestaGenerica());
    assert.equal(supabase.calls.generateLink, 0);
    assert.equal(enviarCorreo.llamadas.length, 0);
  }
});

test("Root genera token para el login y envía al recovery_email distinto", async () => {
  const supabase = crearSupabaseMock({ usuarios: [USUARIO_ROOT_ELEGIBLE], rootRecoveryEmail: "info@parkfacil.cl" });
  const enviarCorreo = crearEnviarCorreoMock();
  await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_ROOT,
    loginIdentifier: USUARIO_ROOT_ELEGIBLE.email,
    supabase,
    enviarCorreo,
    canalEntrega: CANAL_ENTREGA_MICROSOFT,
  });
  assert.equal(supabase.calls.lastGenerateLinkArgs.email, USUARIO_ROOT_ELEGIBLE.email);
  assert.equal(enviarCorreo.llamadas[0].para, "info@parkfacil.cl");
});

// 4. Error al generar el enlace de recuperación (Supabase generateLink falla).
test("error al generar el enlace de recuperación no reporta éxito", async () => {
  const supabase = crearSupabaseMock({
    usuarios: [USUARIO_ROOT_ELEGIBLE],
    errorGenerateLink: { name: "AuthApiError", message: "fallo", status: 500 },
  });
  const enviarCorreo = crearEnviarCorreoMock();

  const resultado = await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_ROOT,
    email: USUARIO_ROOT_ELEGIBLE.email,
    supabase,
    enviarCorreo,
    canalEntrega: CANAL_ENTREGA_MICROSOFT,
  });

  assert.deepEqual(resultado, respuestaError());
  assert.equal(resultado.status, 500);
  assert.equal(enviarCorreo.llamadas.length, 0);
});

// 5. Error genérico de Microsoft Graph al enviar el correo.
test("error genérico de Microsoft Graph no reporta éxito", async () => {
  const supabase = crearSupabaseMock({ usuarios: [USUARIO_ROOT_ELEGIBLE] });
  const enviarCorreo = crearEnviarCorreoMock({
    throwError: Object.assign(new Error("Microsoft Graph rechazó el envío"), {
      name: "MicrosoftGraphSendError",
    }),
  });

  const resultado = await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_ROOT,
    email: USUARIO_ROOT_ELEGIBLE.email,
    supabase,
    enviarCorreo,
    canalEntrega: CANAL_ENTREGA_MICROSOFT,
  });

  assert.deepEqual(resultado, respuestaError());
});

// 6. Microsoft Graph responde 401 (token/autenticación inválida).
test("Microsoft Graph 401 no reporta éxito", async () => {
  const supabase = crearSupabaseMock({ usuarios: [USUARIO_ROOT_ELEGIBLE] });
  const enviarCorreo = crearEnviarCorreoMock({
    throwError: Object.assign(new Error("No autorizado"), {
      name: "MicrosoftGraphSendError",
      status: 401,
      code: "InvalidAuthenticationToken",
    }),
  });

  const resultado = await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_ROOT,
    email: USUARIO_ROOT_ELEGIBLE.email,
    supabase,
    enviarCorreo,
    canalEntrega: CANAL_ENTREGA_MICROSOFT,
  });

  assert.equal(resultado.status, 500);
  assert.equal(resultado.ok, false);
});

// 7. Microsoft Graph responde 403 (permisos insuficientes).
test("Microsoft Graph 403 no reporta éxito", async () => {
  const supabase = crearSupabaseMock({ usuarios: [USUARIO_ROOT_ELEGIBLE] });
  const enviarCorreo = crearEnviarCorreoMock({
    throwError: Object.assign(new Error("Prohibido"), {
      name: "MicrosoftGraphSendError",
      status: 403,
      code: "ErrorAccessDenied",
    }),
  });

  const resultado = await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_ROOT,
    email: USUARIO_ROOT_ELEGIBLE.email,
    supabase,
    enviarCorreo,
    canalEntrega: CANAL_ENTREGA_MICROSOFT,
  });

  assert.equal(resultado.status, 500);
  assert.equal(resultado.ok, false);
});

// 8. Microsoft Graph responde otros 4xx/5xx.
test("Microsoft Graph 4xx/5xx arbitrario no reporta éxito", async () => {
  for (const status of [400, 404, 429, 500, 503]) {
    const supabase = crearSupabaseMock({ usuarios: [USUARIO_ROOT_ELEGIBLE] });
    const enviarCorreo = crearEnviarCorreoMock({
      throwError: Object.assign(new Error(`Graph ${status}`), {
        name: "MicrosoftGraphSendError",
        status,
      }),
    });

    const resultado = await procesarRecuperacionContrasena({
      portal: "root",
      redirectTo: REDIRECT_ROOT,
      email: USUARIO_ROOT_ELEGIBLE.email,
      supabase,
      enviarCorreo,
      canalEntrega: CANAL_ENTREGA_MICROSOFT,
    });

    assert.equal(resultado.status, 500, `status Graph ${status} debería producir 500`);
    assert.equal(resultado.ok, false);
  }
});

// 9. Envío exitoso completo.
test("envío exitoso responde 200 con mensaje genérico y llama a Graph una vez", async () => {
  const supabase = crearSupabaseMock({ usuarios: [USUARIO_ROOT_ELEGIBLE] });
  const enviarCorreo = crearEnviarCorreoMock();

  const resultado = await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_ROOT,
    email: USUARIO_ROOT_ELEGIBLE.email,
    supabase,
    enviarCorreo,
    canalEntrega: CANAL_ENTREGA_MICROSOFT,
  });

  assert.equal(resultado.status, 200);
  assert.equal(resultado.ok, true);
  assert.equal(supabase.calls.generateLink, 1);
  assert.equal(enviarCorreo.llamadas.length, 1);
});

// 10. El endpoint nunca responde 200 cuando falla una operación crítica,
// incluyendo una falla de infraestructura al buscar el usuario (p. ej.
// Supabase local caído) — la causa raíz detectada en esta auditoría.
test("ninguna falla técnica crítica responde 200, incluida caída de Supabase al buscar usuario", async () => {
  const supabaseCaido = crearSupabaseMock({
    usuarios: [USUARIO_ROOT_ELEGIBLE],
    throwOnListUsers: Object.assign(new Error("fetch failed"), { code: "ECONNREFUSED" }),
  });
  const enviarCorreo = crearEnviarCorreoMock();

  const resultado = await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_ROOT,
    email: USUARIO_ROOT_ELEGIBLE.email,
    supabase: supabaseCaido,
    enviarCorreo,
    canalEntrega: CANAL_ENTREGA_MICROSOFT,
  });

  assert.equal(resultado.status, 500);
  assert.equal(resultado.ok, false);
  assert.equal(enviarCorreo.llamadas.length, 0);
});

test("portal no reconocido y correo inválido se descartan de forma genérica (antienumeración)", async () => {
  const supabase = crearSupabaseMock({ usuarios: [USUARIO_ROOT_ELEGIBLE] });
  const enviarCorreo = crearEnviarCorreoMock();

  const sinPortal = await procesarRecuperacionContrasena({
    portal: null,
    redirectTo: null,
    email: USUARIO_ROOT_ELEGIBLE.email,
    supabase,
    enviarCorreo,
    canalEntrega: CANAL_ENTREGA_MICROSOFT,
  });

  assert.deepEqual(sinPortal, respuestaGenerica());

  const correoInvalido = await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_ROOT,
    email: "",
    supabase,
    enviarCorreo,
    canalEntrega: CANAL_ENTREGA_MICROSOFT,
  });

  assert.deepEqual(correoInvalido, respuestaGenerica());
  assert.equal(enviarCorreo.llamadas.length, 0);
});

test("detectarPortal solo admite el header de prueba en localhost/127.0.0.1", () => {
  assert.equal(detectarPortal({ host: "root.parkfacilapp.cl", portalPrueba: "cliente" }), "root");
  assert.equal(detectarPortal({ host: "cliente.parkfacilapp.cl", portalPrueba: "root" }), "cliente");
  assert.equal(detectarPortal({ host: "localhost", portalPrueba: "root" }), "root");
  assert.equal(detectarPortal({ host: "127.0.0.1", portalPrueba: "root" }), "root");
  assert.equal(detectarPortal({ host: "root.localhost:3000", portalPrueba: "cliente" }), "root");
  assert.equal(detectarPortal({ host: "cliente.localhost:3000", portalPrueba: "root" }), "cliente");
  assert.equal(detectarPortal({ host: "localhost", portalPrueba: "" }), "cliente");
  assert.equal(detectarPortal({ host: "dominio-desconocido.cl", portalPrueba: "root" }), null);
});

test("anonimizarEmail nunca expone el correo completo", () => {
  assert.equal(anonimizarEmail("root@parkfacilapp.cl"), "ro**@parkfacilapp.cl");
  assert.equal(anonimizarEmail(""), "***");
  assert.equal(anonimizarEmail("correo-sin-arroba"), "***");
});

// ============================================================
// Cierre del bug de recuperación en local (auditoría 2026-08-28): la causa
// raíz real era src/proxy.js bloqueando /_next/webpack-hmr (rompía la
// hidratación de React, así que ningún formulario disparaba su onSubmit).
// Además, aunque el POST llegara, redirectTo apuntaba siempre al dominio
// de Producción y el correo se enviaba por Microsoft Graph (nunca visible
// en Mailpit) -- así que la prueba local end-to-end pedida por el brief
// era estructuralmente imposible incluso con el POST funcionando. Estos
// tests cubren ambas correcciones LOCAL-ONLY, sin tocar el camino de
// Producción (que sigue probado arriba, sin cambios).
// ============================================================

test("esEntornoLocal: solo localhost/127.0.0.1 (con o sin puerto), nunca un dominio real", () => {
  assert.equal(esEntornoLocal("localhost"), true);
  assert.equal(esEntornoLocal("localhost:3000"), true);
  assert.equal(esEntornoLocal("127.0.0.1"), true);
  assert.equal(esEntornoLocal("127.0.0.1:3000"), true);
  assert.equal(esEntornoLocal("root.parkfacilapp.cl"), false);
  assert.equal(esEntornoLocal("cliente.parkfacilapp.cl"), false);
  assert.equal(esEntornoLocal(""), false);
  assert.equal(esEntornoLocal(undefined), false);
});

// 7. Redirect local correcto.
test("construirRedirectTo: en local usa el origin real de la solicitud, nunca el dominio de Producción", () => {
  assert.equal(construirRedirectTo("root", { local: true, origin: "http://localhost:3000" }), "http://localhost:3000/nueva-contrasena");
  assert.equal(construirRedirectTo("cliente", { local: true, origin: "http://127.0.0.1:3000" }), "http://127.0.0.1:3000/nueva-contrasena");
  assert.equal(construirRedirectTo("root", { local: true, origin: null }), "http://localhost:3000/nueva-contrasena", "sin origin explícito, usa un fallback localhost sensato, nunca el dominio de Producción");
});

// 8. Redirect production correcto.
test("construirRedirectTo: sin local (Producción) el comportamiento no cambió -- mismo dominio hardcodeado de siempre", () => {
  assert.equal(construirRedirectTo("root"), "https://root.parkfacilapp.cl/nueva-contrasena");
  assert.equal(construirRedirectTo("cliente"), "https://cliente.parkfacilapp.cl/nueva-contrasena");
  assert.equal(construirRedirectTo("root", { local: false, origin: "http://localhost:3000" }), "https://root.parkfacilapp.cl/nueva-contrasena", "un origin local no debe colarse a Producción si local=false");
});

// 1. local + mailpit.
test("procesarRecuperacionContrasena canal mailpit: usa resetPasswordForEmail (mailer nativo -> Mailpit), NUNCA Microsoft Graph ni generateLink", async () => {
  const supabase = crearSupabaseMock({ usuarios: [USUARIO_ROOT_ELEGIBLE] });
  const enviarCorreo = crearEnviarCorreoMock();

  const resultado = await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_LOCAL,
    loginIdentifier: USUARIO_ROOT_ELEGIBLE.email,
    supabase,
    enviarCorreo,
    canalEntrega: CANAL_ENTREGA_MAILPIT,
  });

  assert.deepEqual(resultado, respuestaGenerica());
  assert.equal(supabase.calls.resetPasswordForEmail, 1);
  assert.equal(supabase.calls.lastResetPasswordForEmailArgs.email, "root@parkfacilapp.cl");
  assert.equal(supabase.calls.lastResetPasswordForEmailArgs.options.redirectTo, REDIRECT_LOCAL);
  assert.equal(supabase.calls.generateLink, 0, "el canal mailpit nunca debe llamar generateLink");
  assert.equal(enviarCorreo.llamadas.length, 0, "el canal mailpit nunca debe llamar Microsoft Graph");
});

test("procesarRecuperacionContrasena canal mailpit: mantiene intacta la antienumeración (usuario no elegible/inexistente sigue sin enviar nada)", async () => {
  const supabaseNoElegible = crearSupabaseMock({ usuarios: [USUARIO_NO_ELEGIBLE] });
  const resultadoNoElegible = await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_LOCAL,
    loginIdentifier: USUARIO_NO_ELEGIBLE.email,
    supabase: supabaseNoElegible,
    enviarCorreo: crearEnviarCorreoMock(),
    canalEntrega: CANAL_ENTREGA_MAILPIT,
  });
  assert.deepEqual(resultadoNoElegible, respuestaGenerica());
  assert.equal(supabaseNoElegible.calls.resetPasswordForEmail, 0);

  const supabaseInexistente = crearSupabaseMock({ usuarios: [] });
  const resultadoInexistente = await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_LOCAL,
    loginIdentifier: "no-existe@parkfacilapp.cl",
    supabase: supabaseInexistente,
    enviarCorreo: crearEnviarCorreoMock(),
    canalEntrega: CANAL_ENTREGA_MAILPIT,
  });
  assert.deepEqual(resultadoInexistente, respuestaGenerica());
  assert.equal(supabaseInexistente.calls.resetPasswordForEmail, 0);
});

// 10 (canal mailpit). Fallo del mailer nativo no reporta un falso éxito.
test("procesarRecuperacionContrasena canal mailpit: un fallo del mailer nativo de Supabase responde 500, nunca un falso éxito", async () => {
  const supabaseError = crearSupabaseMock({
    usuarios: [USUARIO_ROOT_ELEGIBLE],
    errorResetPasswordForEmail: { name: "AuthApiError", message: "fallo local", status: 500 },
  });
  const resultado = await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_LOCAL,
    loginIdentifier: USUARIO_ROOT_ELEGIBLE.email,
    supabase: supabaseError,
    enviarCorreo: crearEnviarCorreoMock(),
    canalEntrega: CANAL_ENTREGA_MAILPIT,
  });
  assert.deepEqual(resultado, respuestaError());
});

// 2. local + microsoft: prueba real controlada desde localhost, sin dejar
// de resolver redirectTo a localhost (redirectTo y canal son independientes:
// ver resolverCanalEntregaRecuperacion).
test("procesarRecuperacionContrasena canal microsoft con redirect local: usa Microsoft Graph real y mantiene el redirect en localhost", async () => {
  const supabase = crearSupabaseMock({ usuarios: [USUARIO_ROOT_ELEGIBLE], rootRecoveryEmail: "root@parkfacilapp.cl" });
  const enviarCorreo = crearEnviarCorreoMock();

  const resultado = await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_LOCAL,
    loginIdentifier: USUARIO_ROOT_ELEGIBLE.email,
    supabase,
    enviarCorreo,
    canalEntrega: CANAL_ENTREGA_MICROSOFT,
  });

  assert.deepEqual(resultado, respuestaGenerica());
  assert.equal(supabase.calls.generateLink, 1);
  assert.equal(supabase.calls.lastGenerateLinkArgs.options.redirectTo, REDIRECT_LOCAL, "el enlace debe apuntar a localhost aunque el canal sea microsoft");
  assert.equal(enviarCorreo.llamadas.length, 1);
  assert.equal(enviarCorreo.llamadas[0].para, "root@parkfacilapp.cl");
});

// 12. No se duplica mailer: cada canal usa exclusivamente el suyo.
test("procesarRecuperacionContrasena canal microsoft: nunca llama al mailer nativo de Supabase (resetPasswordForEmail)", async () => {
  const supabase = crearSupabaseMock({ usuarios: [USUARIO_ROOT_ELEGIBLE] });
  const enviarCorreo = crearEnviarCorreoMock();

  await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_ROOT,
    loginIdentifier: USUARIO_ROOT_ELEGIBLE.email,
    supabase,
    enviarCorreo,
    canalEntrega: CANAL_ENTREGA_MICROSOFT,
  });

  assert.equal(supabase.calls.resetPasswordForEmail, 0);
  assert.equal(enviarCorreo.llamadas.length, 1);
});

// Defensa en profundidad: un canalEntrega no resuelto (ausente o con un
// valor que no sea exactamente mailpit/microsoft) nunca debe asumir un
// default -- responde 500 sin llamar a ningún mailer.
test("procesarRecuperacionContrasena: canalEntrega no resuelto responde 500 sin llamar a ningún mailer", async () => {
  for (const canalEntrega of [undefined, null, "", "sendgrid", "MAILPIT"]) {
    const supabase = crearSupabaseMock({ usuarios: [USUARIO_ROOT_ELEGIBLE] });
    const enviarCorreo = crearEnviarCorreoMock();

    const resultado = await procesarRecuperacionContrasena({
      portal: "root",
      redirectTo: REDIRECT_ROOT,
      loginIdentifier: USUARIO_ROOT_ELEGIBLE.email,
      supabase,
      enviarCorreo,
      canalEntrega,
    });

    assert.deepEqual(resultado, respuestaError(), `canalEntrega=${JSON.stringify(canalEntrega)} debe responder 500`);
    assert.equal(supabase.calls.resetPasswordForEmail, 0);
    assert.equal(enviarCorreo.llamadas.length, 0);
  }
});

// ============================================================
// resolverCanalEntregaRecuperacion (§ auditoría 2026-08-28): canal de
// entrega explícito y fail-secure vía PASSWORD_RECOVERY_DELIVERY,
// independiente del host de la solicitud.
// ============================================================

// 6. Valor ausente.
test("resolverCanalEntregaRecuperacion: valor ausente usa default mailpit fuera de Producción", () => {
  assert.equal(resolverCanalEntregaRecuperacion({ valorEnv: undefined, nodeEnv: "development" }), CANAL_ENTREGA_MAILPIT);
  assert.equal(resolverCanalEntregaRecuperacion({ valorEnv: "", nodeEnv: "test" }), CANAL_ENTREGA_MAILPIT);
  assert.equal(resolverCanalEntregaRecuperacion({ valorEnv: undefined, nodeEnv: undefined }), CANAL_ENTREGA_MAILPIT);
});

test("resolverCanalEntregaRecuperacion: valor ausente en Producción falla de forma explícita (nunca cae a mailpit)", () => {
  assert.throws(
    () => resolverCanalEntregaRecuperacion({ valorEnv: undefined, nodeEnv: "production" }),
    (error) => error.code === "PASSWORD_RECOVERY_DELIVERY_MISSING"
  );
  assert.throws(
    () => resolverCanalEntregaRecuperacion({ valorEnv: "", nodeEnv: "production" }),
    (error) => error.code === "PASSWORD_RECOVERY_DELIVERY_MISSING"
  );
});

// 3. production + microsoft.
test("resolverCanalEntregaRecuperacion: production + microsoft resuelve a microsoft", () => {
  assert.equal(resolverCanalEntregaRecuperacion({ valorEnv: "microsoft", nodeEnv: "production" }), CANAL_ENTREGA_MICROSOFT);
  assert.equal(resolverCanalEntregaRecuperacion({ valorEnv: "  Microsoft  ", nodeEnv: "production" }), CANAL_ENTREGA_MICROSOFT, "no debe ser sensible a mayúsculas/espacios");
});

// 4. production + mailpit debe rechazarse.
test("resolverCanalEntregaRecuperacion: production + mailpit se rechaza explícitamente", () => {
  assert.throws(
    () => resolverCanalEntregaRecuperacion({ valorEnv: "mailpit", nodeEnv: "production" }),
    (error) => error.code === "PASSWORD_RECOVERY_DELIVERY_FORBIDDEN_IN_PRODUCTION"
  );
});

// 5. Valor inválido.
test("resolverCanalEntregaRecuperacion: valor inválido falla en cualquier entorno", () => {
  for (const nodeEnv of ["production", "development", "test", undefined]) {
    assert.throws(
      () => resolverCanalEntregaRecuperacion({ valorEnv: "sendgrid", nodeEnv }),
      (error) => error.code === "PASSWORD_RECOVERY_DELIVERY_INVALID",
      `nodeEnv=${nodeEnv} debería rechazar un valor inválido`
    );
  }
});

// local + mailpit / local + microsoft a nivel de resolución de canal
// (el host de la solicitud NUNCA participa en esta decisión -- solo
// nodeEnv/valorEnv; el comportamiento "local" real se prueba arriba a
// nivel de procesarRecuperacionContrasena con redirectTo=localhost).
test("resolverCanalEntregaRecuperacion: fuera de Producción respeta un valor explícito, incluido microsoft (prueba real controlada desde local)", () => {
  assert.equal(resolverCanalEntregaRecuperacion({ valorEnv: "mailpit", nodeEnv: "development" }), CANAL_ENTREGA_MAILPIT);
  assert.equal(resolverCanalEntregaRecuperacion({ valorEnv: "microsoft", nodeEnv: "development" }), CANAL_ENTREGA_MICROSOFT);
});

// 11. No se exponen secretos: los errores de configuración solo llevan
// message/code (el nombre de la variable, nunca un valor sensible) --
// Microsoft Graph ni siquiera participa en esta resolución.
test("resolverCanalEntregaRecuperacion: los errores no exponen secretos ni variables sensibles", () => {
  const SECRETO_MICROSOFT = "fake-example-secret-never-a-real-credential-9x7q"; // valor de ejemplo, nunca real
  let error;
  try {
    resolverCanalEntregaRecuperacion({ valorEnv: SECRETO_MICROSOFT, nodeEnv: "production" });
  } catch (errorCapturado) {
    error = errorCapturado;
  }

  assert.ok(error);
  assert.deepEqual(Object.keys(error).sort(), ["code"]);
  // El propio valor rechazado no debe filtrarse completo en el mensaje --
  // resolverCanalEntregaRecuperacion() solo reporta el nombre de la
  // variable de configuración, nunca process.env.MICROSOFT_CLIENT_SECRET
  // ni ningún otro valor sensible.
  assert.doesNotMatch(error.message, /never-a-real-credential/);
  assert.doesNotMatch(JSON.stringify(error), /never-a-real-credential/);
  assert.doesNotMatch(error.message, /client_secret|tenant_id|client_id/i);
});
