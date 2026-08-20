/******************************************************************
 * PARKFACIL CRM
 *---------------------------------------------------------------
 * MÓDULO    : AUTENTICACIÓN
 * SERVICIO  : BOOTSTRAP DEL USUARIO ROOT (platform_admin)
 * ARCHIVO   : src/lib/rootBootstrapCore.mjs
 *---------------------------------------------------------------
 * DESCRIPCIÓN:
 * Lógica pura e inyectable para crear, de forma reproducible e
 * idempotente, el usuario Root (`app_metadata.role = "platform_admin"`)
 * en un Supabase local de desarrollo. Sigue el mismo patrón de
 * inyección de dependencias que microsoftGraphMailCore.mjs y
 * passwordRecoveryCore.mjs para poder probarse sin conectar a
 * servicios reales.
 *
 * Reglas de seguridad clave:
 * - Si el usuario ya existe (por correo), NO se modifica ni se
 *   duplica: se devuelve tal cual, sin tocar su app_metadata,
 *   user_metadata ni contraseña.
 * - platform_admin no requiere fila en `company_members` (alcance
 *   global, ver src/lib/auth/contextCore.mjs).
 * - Nunca debe ejecutarse contra un Supabase remoto sin una
 *   confirmación explícita (ver esSupabaseLocal / scripts/bootstrap-root-local.mjs).
 ******************************************************************/

import { buscarUsuarioPorEmail, normalizarEmail } from "./passwordRecoveryCore.mjs";

export class RootBootstrapConfigurationError extends Error {
  constructor(faltantes) {
    super(`Faltan variables requeridas para el bootstrap del Root: ${faltantes.join(", ")}`);
    this.name = "RootBootstrapConfigurationError";
    this.faltantes = faltantes;
  }
}

export class RootBootstrapEntornoRemotoError extends Error {
  constructor(url) {
    super(
      `El bootstrap del Root está bloqueado: "${url}" no parece ser un Supabase local. ` +
        `Este mecanismo nunca debe ejecutarse contra producción sin confirmación explícita.`
    );
    this.name = "RootBootstrapEntornoRemotoError";
  }
}

/**
 * Determina si una URL de Supabase corresponde a una instancia local
 * (127.0.0.1 / localhost), único entorno donde este bootstrap puede
 * ejecutarse automáticamente.
 */
export function esSupabaseLocal(url) {
  try {
    const host = new URL(String(url || "")).hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

/**
 * Valida que existan las variables mínimas requeridas antes de
 * intentar cualquier operación contra Supabase. Falla de forma
 * segura (lanza un error tipado) en vez de continuar con datos
 * incompletos.
 */
export function validarConfiguracionBootstrap({ url, serviceRoleKey, email }) {
  const faltantes = [];

  if (!url) faltantes.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) faltantes.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!email) faltantes.push("ROOT_BOOTSTRAP_EMAIL");

  if (faltantes.length > 0) {
    throw new RootBootstrapConfigurationError(faltantes);
  }
}

/**
 * Verifica el guard de entorno: bloquea la ejecución contra un
 * Supabase que no sea local, salvo que se pase `permitirRemoto: true`
 * de forma explícita (nunca por defecto).
 */
export function verificarEntornoPermitido({ url, permitirRemoto = false }) {
  if (permitirRemoto) {
    return;
  }

  if (!esSupabaseLocal(url)) {
    throw new RootBootstrapEntornoRemotoError(url);
  }
}

/**
 * Crea el usuario Root (platform_admin) si no existe. Si ya existe,
 * lo devuelve sin modificarlo. No crea ninguna fila en
 * `company_members`: platform_admin tiene alcance global.
 */
export async function crearOReutilizarRoot({ supabase, email, password, nombreCompleto = "Root ParkFacil" }) {
  const emailNormalizado = normalizarEmail(email);

  const existente = await buscarUsuarioPorEmail(supabase, emailNormalizado);

  if (existente) {
    return {
      creado: false,
      yaExistia: true,
      userId: existente.id,
      role: existente.app_metadata?.role || null,
      temporaryPassword: null,
    };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: emailNormalizado,
    password,
    email_confirm: true,
    app_metadata: {
      role: "platform_admin",
    },
    user_metadata: {
      full_name: nombreCompleto,
      must_change_password: true,
      bootstrap: true,
    },
  });

  if (error) {
    throw error;
  }

  return {
    creado: true,
    yaExistia: false,
    userId: data.user.id,
    role: data.user.app_metadata?.role || null,
    temporaryPassword: password,
  };
}
