import assert from "node:assert/strict";
import test from "node:test";

import {
  RootBootstrapConfigurationError,
  RootBootstrapEntornoRemotoError,
  crearOReutilizarRoot,
  esSupabaseLocal,
  validarConfiguracionBootstrap,
  verificarEntornoPermitido,
} from "./rootBootstrapCore.mjs";

function crearSupabaseMock({ usuarios = [], createUserResult = null, errorCreateUser = null } = {}) {
  const llamadasCreateUser = [];

  return {
    llamadasCreateUser,
    auth: {
      admin: {
        async listUsers() {
          return { data: { users: usuarios }, error: null };
        },
        async createUser(datos) {
          llamadasCreateUser.push(datos);

          if (errorCreateUser) {
            return { data: null, error: errorCreateUser };
          }

          return {
            data: {
              user: createUserResult || {
                id: "root-nuevo-id",
                email: datos.email,
                app_metadata: datos.app_metadata,
              },
            },
            error: null,
          };
        },
      },
    },
  };
}

// 1. El bootstrap crea el Root en local cuando no existe.
test("crea el usuario Root cuando no existe", async () => {
  const supabase = crearSupabaseMock({ usuarios: [] });

  const resultado = await crearOReutilizarRoot({
    supabase,
    email: "root@parkfacilapp.cl",
    password: "clave-temporal-de-prueba",
  });

  assert.equal(resultado.creado, true);
  assert.equal(resultado.yaExistia, false);
  assert.equal(supabase.llamadasCreateUser.length, 1);
  assert.equal(supabase.llamadasCreateUser[0].email, "root@parkfacilapp.cl");
  assert.equal(supabase.llamadasCreateUser[0].email_confirm, true);
});

// 2. El usuario obtiene app_metadata.role = "platform_admin".
test("el usuario creado obtiene app_metadata.role platform_admin", async () => {
  const supabase = crearSupabaseMock({ usuarios: [] });

  const resultado = await crearOReutilizarRoot({
    supabase,
    email: "root@parkfacilapp.cl",
    password: "clave-temporal-de-prueba",
  });

  assert.equal(resultado.role, "platform_admin");
  assert.equal(supabase.llamadasCreateUser[0].app_metadata.role, "platform_admin");
});

// 3. No se duplica si ya existe.
test("no crea un usuario duplicado si el correo ya existe", async () => {
  const existente = {
    id: "root-existente-id",
    email: "root@parkfacilapp.cl",
    app_metadata: { role: "platform_admin" },
  };
  const supabase = crearSupabaseMock({ usuarios: [existente] });

  const resultado = await crearOReutilizarRoot({
    supabase,
    email: "Root@ParkFacilApp.cl",
    password: "clave-temporal-de-prueba",
  });

  assert.equal(resultado.creado, false);
  assert.equal(resultado.yaExistia, true);
  assert.equal(resultado.userId, existente.id);
  assert.equal(supabase.llamadasCreateUser.length, 0);
});

// 4. No modifica usuarios existentes.
test("no modifica un usuario existente aunque su rol o metadata difieran", async () => {
  const existente = {
    id: "root-existente-id",
    email: "root@parkfacilapp.cl",
    app_metadata: { role: "operator" }, // intencionalmente distinto
  };
  const supabase = crearSupabaseMock({ usuarios: [existente] });
  // El mock no expone updateUserById: si el core intentara llamarlo, la
  // prueba fallaría con un TypeError, evidenciando que se intentó modificar.

  const resultado = await crearOReutilizarRoot({
    supabase,
    email: existente.email,
    password: "clave-temporal-de-prueba",
  });

  assert.equal(resultado.yaExistia, true);
  assert.equal(resultado.role, "operator"); // se reporta tal cual, sin corregirlo
  assert.equal(supabase.llamadasCreateUser.length, 0);
});

// 5. No se ejecuta accidentalmente contra producción.
test("verificarEntornoPermitido bloquea un Supabase remoto por defecto", () => {
  assert.throws(
    () => verificarEntornoPermitido({ url: "https://proyecto-real.supabase.co" }),
    RootBootstrapEntornoRemotoError
  );

  // Con confirmación explícita, se permite (decisión consciente del operador).
  assert.doesNotThrow(() =>
    verificarEntornoPermitido({ url: "https://proyecto-real.supabase.co", permitirRemoto: true })
  );

  assert.doesNotThrow(() => verificarEntornoPermitido({ url: "http://127.0.0.1:54321" }));
  assert.doesNotThrow(() => verificarEntornoPermitido({ url: "http://localhost:54321" }));
});

test("esSupabaseLocal distingue local de remoto", () => {
  assert.equal(esSupabaseLocal("http://127.0.0.1:54321"), true);
  assert.equal(esSupabaseLocal("http://localhost:54321"), true);
  assert.equal(esSupabaseLocal("https://abcd1234.supabase.co"), false);
  assert.equal(esSupabaseLocal(""), false);
  assert.equal(esSupabaseLocal("no-es-una-url"), false);
});

// 6. El mecanismo falla de forma segura si faltan variables requeridas.
test("validarConfiguracionBootstrap falla de forma segura ante variables faltantes", () => {
  assert.throws(
    () => validarConfiguracionBootstrap({ url: "", serviceRoleKey: "", email: "" }),
    (error) => {
      assert.equal(error instanceof RootBootstrapConfigurationError, true);
      assert.deepEqual(error.faltantes, [
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "ROOT_BOOTSTRAP_EMAIL",
      ]);
      return true;
    }
  );

  assert.doesNotThrow(() =>
    validarConfiguracionBootstrap({
      url: "http://127.0.0.1:54321",
      serviceRoleKey: "clave-servicio",
      email: "root@parkfacilapp.cl",
    })
  );
});

test("createUser fallido en Supabase se propaga como error controlado, sin reportar éxito", async () => {
  const supabase = crearSupabaseMock({
    usuarios: [],
    errorCreateUser: { name: "AuthApiError", message: "fallo de creación" },
  });

  await assert.rejects(() =>
    crearOReutilizarRoot({
      supabase,
      email: "root@parkfacilapp.cl",
      password: "clave-temporal-de-prueba",
    })
  );
});
