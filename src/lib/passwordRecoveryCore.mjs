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
  "Si la cuenta está habilitada para recuperar su contraseña, recibirá un enlace en su correo.";

export const RESPUESTA_ERROR =
  "No fue posible procesar tu solicitud en este momento. Inténtalo nuevamente más tarde.";

const ROLES_CLIENTE_PERMITIDOS = new Set(["company_admin", "operator"]);

export function normalizarEmail(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase();
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

  if (hostNormalizado === "localhost" || hostNormalizado === "127.0.0.1") {
    const prueba = String(portalPrueba || "").trim().toLowerCase();
    return prueba === "root" ? "root" : "cliente";
  }

  return null;
}

export function construirRedirectTo(portal) {
  if (portal === "root") {
    return "https://root.parkfacilapp.cl/nueva-contrasena";
  }

  if (portal === "cliente") {
    return "https://cliente.parkfacilapp.cl/nueva-contrasena";
  }

  return null;
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

export async function validarCliente(supabase, usuario) {
  if (!usuarioAuthHabilitado(usuario)) {
    return false;
  }

  const { data: membresia, error: errorMembresia } = await supabase
    .from("company_members")
    .select("company_id, role, status, pos_only")
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

  return Array.isArray(contratos) && contratos.length > 0;
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
 */
export async function procesarRecuperacionContrasena({
  portal,
  redirectTo,
  email,
  supabase,
  enviarCorreo,
  diagnosticar = () => {},
}) {
  diagnosticar("Portal identificado", portal);

  if (!portal || !redirectTo) {
    diagnosticar("Solicitud descartada", "portal no permitido");
    return respuestaGenerica();
  }

  const emailNormalizado = normalizarEmail(email);

  diagnosticar("Correo solicitado", anonimizarEmail(emailNormalizado));

  if (!emailNormalizado || emailNormalizado.length > 254) {
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

  const elegible =
    portal === "root" ? validarRoot(usuario) : await validarCliente(supabase, usuario);

  diagnosticar("Resultado de elegibilidad", elegible);

  if (!elegible) {
    diagnosticar("Correo no enviado", "cuenta no elegible");
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
      para: emailNormalizado,
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
