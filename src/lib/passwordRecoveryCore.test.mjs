import assert from "node:assert/strict";
import test from "node:test";

import {
  anonimizarEmail,
  construirRedirectTo,
  detectarPortal,
  procesarRecuperacionContrasena,
  respuestaError,
  respuestaGenerica,
} from "./passwordRecoveryCore.mjs";

const REDIRECT_ROOT = construirRedirectTo("root");

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
  throwOnListUsers = null,
  errorGenerateLink = null,
  throwOnGenerateLink = null,
  actionLink = "https://root.parkfacilapp.cl/nueva-contrasena?token=abc",
} = {}) {
  let listUsersCalls = 0;
  let generateLinkCalls = 0;

  return {
    calls: {
      get listUsers() {
        return listUsersCalls;
      },
      get generateLink() {
        return generateLinkCalls;
      },
    },
    auth: {
      admin: {
        async listUsers() {
          listUsersCalls += 1;

          if (throwOnListUsers) {
            throw throwOnListUsers;
          }

          return { data: { users: usuarios }, error: null };
        },
        async generateLink() {
          generateLinkCalls += 1;

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
  });

  assert.deepEqual(resultado, respuestaGenerica());
  assert.equal(enviarCorreo.llamadas.length, 0);
  assert.equal(supabase.calls.generateLink, 0);
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
  });

  assert.deepEqual(sinPortal, respuestaGenerica());

  const correoInvalido = await procesarRecuperacionContrasena({
    portal: "root",
    redirectTo: REDIRECT_ROOT,
    email: "",
    supabase,
    enviarCorreo,
  });

  assert.deepEqual(correoInvalido, respuestaGenerica());
  assert.equal(enviarCorreo.llamadas.length, 0);
});

test("detectarPortal solo admite el header de prueba en localhost/127.0.0.1", () => {
  assert.equal(detectarPortal({ host: "root.parkfacilapp.cl", portalPrueba: "cliente" }), "root");
  assert.equal(detectarPortal({ host: "cliente.parkfacilapp.cl", portalPrueba: "root" }), "cliente");
  assert.equal(detectarPortal({ host: "localhost", portalPrueba: "root" }), "root");
  assert.equal(detectarPortal({ host: "127.0.0.1", portalPrueba: "root" }), "root");
  assert.equal(detectarPortal({ host: "localhost", portalPrueba: "" }), "cliente");
  assert.equal(detectarPortal({ host: "dominio-desconocido.cl", portalPrueba: "root" }), null);
});

test("anonimizarEmail nunca expone el correo completo", () => {
  assert.equal(anonimizarEmail("root@parkfacilapp.cl"), "ro**@parkfacilapp.cl");
  assert.equal(anonimizarEmail(""), "***");
  assert.equal(anonimizarEmail("correo-sin-arroba"), "***");
});
