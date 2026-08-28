/******************************************************************
 * PARKFACIL CRM
 *---------------------------------------------------------------
 * MÓDULO    : AUTENTICACIÓN
 * SERVICIO  : RECUPERACIÓN DE CONTRASEÑA
 * ARCHIVO   : src/lib/passwordRecoveryCore.mjs
 *---------------------------------------------------------------
 * DESCRIPCIÓN:
 * Lógica pura (sin dependencias de framework) del flujo de
 * recuperación de contraseña. Recibe el cliente de Supabase y la
 * función de envío de correo por inyección de dependencias para
 * poder probarse sin conectar a servicios reales, siguiendo el
 * mismo patrón que microsoftGraphMailCore.js.
 *
 * Regla de negocio clave: el proceso solo responde éxito (200)
 * cuando el correo fue efectivamente enviado, o cuando la
 * solicitud es descartada de forma legítima por antienumeración
 * (usuario inexistente o no elegible). Cualquier falla técnica
 * (Supabase, generación del enlace o Microsoft Graph) para una
 * cuenta elegible responde con un error controlado (500), nunca
 * con un falso éxito.
 ******************************************************************/

export const RESPUESTA_GENERICA =
  "Si la cuenta existe y tiene un correo de recuperación configurado, recibirás un mensaje con las instrucciones.";

export const RESPUESTA_ERROR =
  "No fue posible procesar tu solicitud en este momento. Inténtalo nuevamente más tarde.";

const ROLES_CLIENTE_PERMITIDOS = new Set(["company_admin", "operator"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Canal de entrega del correo de recuperación (§ auditoría 2026-08-28).
// Ver resolverCanalEntregaRecuperacion() para las reglas completas.
export const CANAL_ENTREGA_MAILPIT = "mailpit";
export const CANAL_ENTREGA_MICROSOFT = "microsoft";

const CANALES_ENTREGA_VALIDOS = new Set([CANAL_ENTREGA_MAILPIT, CANAL_ENTREGA_MICROSOFT]);

export function normalizarEmail(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase();
}

export function esEmailValido(valor) {
  const email = normalizarEmail(valor);
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function escaparHtml(valor) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Anonimiza parcialmente un correo para uso exclusivo en logging
 * temporal de diagnóstico. Nunca debe registrarse el correo completo.
 */
export function anonimizarEmail(email) {
  const valor = normalizarEmail(email);

  if (!valor || !valor.includes("@")) {
    return "***";
  }

  const [usuario, dominio] = valor.split("@");
  const visibles = usuario.slice(0, 2);
  const enmascarado = "*".repeat(Math.max(usuario.length - visibles.length, 1));

  return `${visibles}${enmascarado}@${dominio}`;
}

/**
 * Determina el portal (root | cliente) a partir del host de la
 * solicitud. En localhost/127.0.0.1 se admite un header de prueba
 * exclusivamente para pruebas locales.
 */
export function detectarPortal({ host, portalPrueba }) {
  const hostNormalizado = String(host || "")
    .split(":")[0]
    .trim()
    .toLowerCase();

  if (hostNormalizado === "root.parkfacilapp.cl") {
    return "root";
  }

  if (hostNormalizado === "cliente.parkfacilapp.cl") {
    return "cliente";
  }

  if (hostNormalizado === "root.localhost") {
    return "root";
  }

  if (hostNormalizado === "cliente.localhost") {
    return "cliente";
  }

  if (hostNormalizado === "localhost" || hostNormalizado === "127.0.0.1") {
    const prueba = String(portalPrueba || "").trim().toLowerCase();
    return prueba === "root" ? "root" : "cliente";
  }

  return null;
}

// Entorno local de desarrollo: mismo criterio de host que detectarPortal
// (localhost/127.0.0.1, con o sin puerto). Gobierna EXCLUSIVAMENTE el
// redirectTo del enlace de recuperación (antes quedaba hardcodeado al
// dominio de Producción incluso en local, así que el enlace nunca podía
// apuntar a localhost -- causa raíz de que el paso 8 de la prueba local
// fuera estructuralmente imposible).
//
// El canal de ENVÍO del correo (Mailpit vs Microsoft Graph) ya NO depende
// de esta función: se resuelve de forma explícita e independiente vía
// PASSWORD_RECOVERY_DELIVERY (ver resolverCanalEntregaRecuperacion), para
// poder probar el envío real por Microsoft Graph desde localhost sin dejar
// de usar Mailpit por defecto en el resto de los casos locales.
export function esEntornoLocal(host) {
  const hostNormalizado = String(host || "").split(":")[0].trim().toLowerCase();
  return hostNormalizado === "localhost" || hostNormalizado === "127.0.0.1";
}

export function construirRedirectTo(portal, { local = false, origin = null } = {}) {
  if (local) {
    return origin ? `${origin}/nueva-contrasena` : "http://localhost:3000/nueva-contrasena";
  }

  if (portal === "root") {
    return "https://root.parkfacilapp.cl/nueva-contrasena";
  }

  if (portal === "cliente") {
    return "https://cliente.parkfacilapp.cl/nueva-contrasena";
  }

  return null;
}

/**
 * Resuelve, de forma explícita y auditable, el canal de entrega del correo
 * de recuperación de contraseña a partir de PASSWORD_RECOVERY_DELIVERY.
 *
 * Deliberadamente NO decide el canal a partir del host de la solicitud
 * (eso sigue gobernando únicamente redirectTo, ver
 * construirRedirectTo/esEntornoLocal) -- así queda desacoplado "a qué URL
 * vuelve el usuario" de "por qué canal se entrega el correo", permitiendo
 * probar el envío real por Microsoft Graph desde localhost sin dejar de
 * usar Mailpit por defecto en el resto de los casos locales.
 *
 * Reglas fail-secure:
 *  - Producción (`nodeEnv === "production"`) exige
 *    PASSWORD_RECOVERY_DELIVERY=microsoft explícito. Cualquier otro valor
 *    (ausente, "mailpit", o inválido) lanza un error explícito -- jamás
 *    cae en silencio a Mailpit en Producción.
 *  - Fuera de Producción, un valor ausente usa el default documentado
 *    "mailpit" (ver .env.example). Un valor explícito ("mailpit" o
 *    "microsoft") siempre se respeta, incluso en local, para permitir la
 *    prueba real controlada con Microsoft Graph descrita en el runbook.
 *  - Cualquier valor que no sea "mailpit" ni "microsoft" es inválido y
 *    lanza error explícito en cualquier entorno.
 */
export function resolverCanalEntregaRecuperacion({
  valorEnv,
  nodeEnv = process.env.NODE_ENV,
} = {}) {
  const valor = String(valorEnv || "").trim().toLowerCase();
  const esProduccion = nodeEnv === "production";

  if (!valor) {
    if (esProduccion) {
      throw Object.assign(
        new Error("PASSWORD_RECOVERY_DELIVERY no está definido en Producción"),
        { code: "PASSWORD_RECOVERY_DELIVERY_MISSING" }
      );
    }
    return CANAL_ENTREGA_MAILPIT;
  }

  // Nota: el mensaje NUNCA repite `valor` -- PASSWORD_RECOVERY_DELIVERY
  // solo debería contener "mailpit"/"microsoft", pero si alguien pegara
  // ahí por error un secreto real, este mensaje (que sí puede llegar a
  // logs) jamás debe reflejarlo. El código de error basta para
  // diagnosticar sin exponer el valor recibido.
  if (!CANALES_ENTREGA_VALIDOS.has(valor)) {
    throw Object.assign(
      new Error("PASSWORD_RECOVERY_DELIVERY tiene un valor inválido"),
      { code: "PASSWORD_RECOVERY_DELIVERY_INVALID" }
    );
  }

  if (esProduccion && valor !== CANAL_ENTREGA_MICROSOFT) {
    throw Object.assign(
      new Error(`PASSWORD_RECOVERY_DELIVERY="${valor}" no está permitido en Producción`),
      { code: "PASSWORD_RECOVERY_DELIVERY_FORBIDDEN_IN_PRODUCTION" }
    );
  }

  return valor;
}

export function usuarioAuthHabilitado(usuario) {
  if (!usuario) {
    return false;
  }

  if (!usuario.email_confirmed_at) {
    return false;
  }

  if (usuario.deleted_at) {
    return false;
  }

  if (usuario.banned_until && new Date(usuario.banned_until).getTime() > Date.now()) {
    return false;
  }

  return true;
}

export async function buscarUsuarioPorEmail(supabase, email) {
  const porPagina = 200;
  let pagina = 1;

  while (pagina <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page: pagina,
      perPage: porPagina,
    });

    if (error) {
      throw error;
    }

    const usuarios = Array.isArray(data?.users) ? data.users : [];

    const encontrado = usuarios.find(
      (usuario) => normalizarEmail(usuario.email) === email
    );

    if (encontrado) {
      return encontrado;
    }

    if (usuarios.length < porPagina) {
      return null;
    }

    pagina += 1;
  }

  return null;
}

export function validarRoot(usuario) {
  if (!usuarioAuthHabilitado(usuario)) {
    return false;
  }

  const rol = usuario.app_metadata?.role || null;

  return rol === "platform_admin";
}

export async function obtenerMembresiaClienteElegible(supabase, usuario) {
  if (!usuarioAuthHabilitado(usuario)) {
    return false;
  }

  const { data: membresia, error: errorMembresia } = await supabase
    .from("company_members")
    .select("company_id, role, status, pos_only, recovery_email")
    .eq("user_id", usuario.id)
    .eq("status", "active")
    .maybeSingle();

  if (errorMembresia || !membresia) {
    return false;
  }

  if (!ROLES_CLIENTE_PERMITIDOS.has(membresia.role)) {
    return false;
  }

  const { data: empresa, error: errorEmpresa } = await supabase
    .from("companies")
    .select("id, status, relationship_type")
    .eq("id", membresia.company_id)
    .eq("status", "active")
    .eq("relationship_type", "client")
    .maybeSingle();

  if (errorEmpresa || !empresa) {
    return false;
  }

  const hoy = new Date().toISOString().slice(0, 10);

  const { data: contratos, error: errorContratos } = await supabase
    .from("company_contracts")
    .select("id, status, starts_on, ends_on")
    .eq("company_id", empresa.id)
    .eq("status", "active")
    .lte("starts_on", hoy)
    .gte("ends_on", hoy)
    .limit(1);

  if (errorContratos) {
    return false;
  }

  return Array.isArray(contratos) && contratos.length > 0 ? membresia : null;
}

export async function validarCliente(supabase, usuario) {
  return Boolean(await obtenerMembresiaClienteElegible(supabase, usuario));
}

export async function obtenerRecoveryEmailRoot(supabase, usuario) {
  if (!validarRoot(usuario)) return null;
  const { data, error } = await supabase
    .from("platform_admin_profiles")
    .select("recovery_email")
    .eq("user_id", usuario.id)
    .maybeSingle();
  if (error) throw error;
  return normalizarEmail(data?.recovery_email);
}

export function generarHtmlCorreo(enlaceSeguro) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#172033;line-height:1.6">
      <h1 style="color:#041E42;font-size:28px;">
        Recuperar contraseña
      </h1>

      <p>
        Recibimos una solicitud para crear una nueva contraseña
        para su cuenta ParkFacil.
      </p>

      <p style="margin:30px 0;">
        <a
          href="${enlaceSeguro}"
          style="display:inline-block;background:#3150D8;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:8px;font-weight:bold;"
        >
          Crear nueva contraseña
        </a>
      </p>

      <p>
        Si usted no realizó esta solicitud, ignore este mensaje.
      </p>

      <p style="font-size:13px;color:#64748b;">
        Por seguridad, este enlace es personal y tiene una
        vigencia limitada.
      </p>
    </div>
  `;
}

export function respuestaGenerica() {
  return { status: 200, ok: true, mensaje: RESPUESTA_GENERICA };
}

export function respuestaError() {
  return { status: 500, ok: false, mensaje: RESPUESTA_ERROR };
}

/**
 * Orquesta el flujo completo de recuperación de contraseña.
 *
 * IMPORTANTE: solo devuelve `respuestaGenerica()` (200) en dos
 * casos: (a) la solicitud es descartada legítimamente por
 * antienumeración (portal inválido, correo inválido, usuario
 * inexistente o no elegible), o (b) el correo fue efectivamente
 * enviado por el proveedor. Cualquier falla técnica intermedia
 * para una cuenta elegible devuelve `respuestaError()` (500).
 *
 * `canalEntrega` debe ser un valor ya resuelto por
 * resolverCanalEntregaRecuperacion() (CANAL_ENTREGA_MAILPIT o
 * CANAL_ENTREGA_MICROSOFT). Cualquier otro valor (incluido ausente) se
 * trata como configuración no resuelta y responde `respuestaError()`,
 * nunca cae en silencio a Mailpit.
 */
export async function procesarRecuperacionContrasena({
  portal,
  redirectTo,
  loginIdentifier,
  email,
  supabase,
  enviarCorreo,
  canalEntrega,
  diagnosticar = () => {},
}) {
  diagnosticar("Portal identificado", portal);

  if (!portal || !redirectTo) {
    diagnosticar("Solicitud descartada", "portal no permitido");
    return respuestaGenerica();
  }

  const emailNormalizado = normalizarEmail(loginIdentifier ?? email);

  diagnosticar("Correo solicitado", anonimizarEmail(emailNormalizado));

  if (!esEmailValido(emailNormalizado)) {
    diagnosticar("Solicitud descartada", "correo inválido");
    return respuestaGenerica();
  }

  let usuario;

  try {
    usuario = await buscarUsuarioPorEmail(supabase, emailNormalizado);
    diagnosticar("Resultado de búsqueda", usuario ? "usuario encontrado" : "usuario no encontrado");
  } catch (errorBusqueda) {
    diagnosticar("Error crítico en búsqueda de usuario", {
      type: errorBusqueda?.name || "Error",
      code: errorBusqueda?.code || "USER_LOOKUP_FAILED",
    });

    return respuestaError();
  }

  const membresia = portal === "cliente"
    ? await obtenerMembresiaClienteElegible(supabase, usuario)
    : null;
  const elegible = portal === "root" ? validarRoot(usuario) : Boolean(membresia);

  diagnosticar("Resultado de elegibilidad", elegible);

  if (!elegible) {
    diagnosticar("Correo no enviado", "cuenta no elegible");
    return respuestaGenerica();
  }

  // Canal de entrega no resuelto a un valor válido: nunca se asume un
  // default aquí (eso ya lo decidió resolverCanalEntregaRecuperacion, con
  // sus propias reglas fail-secure). Un valor inesperado en este punto es
  // un error de configuración/integración, no una solicitud descartable
  // por antienumeración -- responde 500, nunca un falso éxito.
  if (canalEntrega !== CANAL_ENTREGA_MAILPIT && canalEntrega !== CANAL_ENTREGA_MICROSOFT) {
    diagnosticar("Error crítico", "canal de entrega no resuelto: " + JSON.stringify(canalEntrega));
    return respuestaError();
  }

  // Canal Mailpit (§ auditoría 2026-08-28): nunca usa Microsoft Graph (un
  // servicio externo real, que además solo puede entregarse a la cuenta de
  // correo asociada al Auth user, no al recovery_email en perfil) ni el
  // dominio de Producción en redirectTo (eso lo decide construirRedirectTo
  // por separado). En su lugar se usa supabase.auth.resetPasswordForEmail,
  // el mecanismo NATIVO de Supabase Auth: en local, ese mailer entrega
  // automáticamente al servidor SMTP de prueba (Mailpit) que trae el propio
  // stack de "supabase start", sin configurar nada adicional. Mantiene
  // intactas las mismas verificaciones de elegibilidad/antienumeración de
  // arriba -- solo cambia CÓMO se entrega el correo, nunca A QUIÉN se le
  // permite pedirlo. Producción nunca resuelve a este canal (ver
  // resolverCanalEntregaRecuperacion).
  if (canalEntrega === CANAL_ENTREGA_MAILPIT) {
    try {
      const { error: errorEnvioLocal } = await supabase.auth.resetPasswordForEmail(emailNormalizado, { redirectTo });
      if (errorEnvioLocal) throw errorEnvioLocal;
    } catch (errorEnvioLocal) {
      diagnosticar("Error crítico en envío local (mailer nativo de Supabase Auth)", {
        type: errorEnvioLocal?.name || "AuthError",
        code: errorEnvioLocal?.code || "LOCAL_RESET_EMAIL_FAILED",
        status: errorEnvioLocal?.status || null,
      });
      return respuestaError();
    }
    diagnosticar("Resultado del envío", "correo enviado mediante el mailer local de Supabase Auth (Mailpit)");
    return respuestaGenerica();
  }

  // A partir de aquí, canalEntrega === CANAL_ENTREGA_MICROSOFT (única
  // alternativa posible tras el guard de arriba): se usa el mailer real de
  // Microsoft Graph, sin importar si la solicitud vino de local o de
  // Producción -- el destinatario puede pertenecer a cualquier proveedor
  // válido (Outlook, Gmail, Yahoo, dominio corporativo, etc.), Microsoft
  // Graph no distingue por proveedor del destinatario.
  //
  // El destinatario siempre se resuelve server-side desde el perfil asociado
  // al mismo user_id: platform_admin_profiles para Root y company_members
  // para administradores de empresa/operadores.
  let destinatario;
  try {
    destinatario = portal === "root"
      ? await obtenerRecoveryEmailRoot(supabase, usuario)
      : normalizarEmail(membresia?.recovery_email);
  } catch (errorPerfil) {
    diagnosticar("Error crítico en perfil de recuperación", {
      type: errorPerfil?.name || "Error",
      code: errorPerfil?.code || "RECOVERY_PROFILE_LOOKUP_FAILED",
    });
    return respuestaError();
  }

  if (!esEmailValido(destinatario)) {
    diagnosticar("Correo no enviado", "recovery_email ausente o inválido");
    return respuestaGenerica();
  }

  let data;
  let errorGeneracion;

  try {
    ({ data, error: errorGeneracion } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: emailNormalizado,
      options: { redirectTo },
    }));
  } catch (excepcionGeneracion) {
    errorGeneracion = excepcionGeneracion;
  }

  if (errorGeneracion) {
    diagnosticar("Error crítico en generación del enlace", {
      type: errorGeneracion?.name || "AuthError",
      code: errorGeneracion?.code || "RECOVERY_LINK_FAILED",
      status: errorGeneracion?.status || null,
    });

    return respuestaError();
  }

  const enlaceRecuperacion = data?.properties?.action_link;

  if (!enlaceRecuperacion) {
    diagnosticar("Error crítico", "Supabase no generó el enlace de recuperación");
    return respuestaError();
  }

  const enlaceSeguro = escaparHtml(enlaceRecuperacion);

  try {
    await enviarCorreo({
      para: destinatario,
      asunto: "Recuperación de contraseña | ParkFacil",
      html: generarHtmlCorreo(enlaceSeguro),
      texto: `Recupere su contraseña utilizando este enlace: ${enlaceRecuperacion}`,
    });
  } catch (errorEnvio) {
    diagnosticar("Error crítico en envío por Microsoft Graph", {
      type: errorEnvio?.name || "Error",
      code: errorEnvio?.code || "GRAPH_SEND_FAILED",
      status: errorEnvio?.status || null,
    });

    return respuestaError();
  }

  diagnosticar("Resultado del envío", "correo enviado mediante Microsoft 365");

  return respuestaGenerica();
}
