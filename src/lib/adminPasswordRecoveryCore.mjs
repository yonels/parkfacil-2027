/******************************************************************
 * PARKFACIL CRM
 *---------------------------------------------------------------
 * MÓDULO    : AUTENTICACIÓN
 * SERVICIO  : RECUPERACIÓN DE CONTRASEÑA DISPARADA POR UN ADMINISTRADOR
 * ARCHIVO   : src/lib/adminPasswordRecoveryCore.mjs
 *---------------------------------------------------------------
 * DESCRIPCIÓN:
 * Envía un correo de recuperación real (mismo mecanismo que el
 * autoservicio público de /recuperar-contrasena: Supabase
 * `generateLink` + Microsoft Graph) pero disparado desde una acción
 * administrativa ya autenticada y autorizada (Root o company_admin
 * gestionando un usuario de su propia empresa), en vez del formulario
 * público. No es un sistema paralelo: reutiliza construirRedirectTo,
 * escaparHtml y generarHtmlCorreo de passwordRecoveryCore.mjs.
 *
 * A diferencia del flujo público (antienumeración, siempre responde
 * genérico), aquí el llamador YA sabe que el usuario existe — por lo
 * tanto se informa honestamente si el envío falló, en vez de simular
 * éxito. Nunca revela contraseñas, tokens ni secretos.
 ******************************************************************/

import {
  construirRedirectTo,
  escaparHtml,
  generarHtmlCorreo,
} from "./passwordRecoveryCore.mjs";

export class AdminRecoverySendError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "AdminRecoverySendError";
    this.code = code;
  }
}

/**
 * @param {Object} params
 * @param {Object} params.supabase - Cliente admin de Supabase.
 * @param {(datos: Object) => Promise<Object>} params.enviarCorreo - enviarCorreoMicrosoft (inyectado).
 * @param {string} params.email - Correo real y vigente del usuario destino.
 * @param {"root"|"cliente"} [params.portalDestino] - Portal al que debe apuntar el enlace.
 * @param {(etiqueta: string, valor?: unknown) => void} [params.diagnosticar] - Logging seguro opcional.
 */
export async function enviarRecuperacionAdministrativa({
  supabase,
  enviarCorreo,
  email,
  portalDestino = "cliente",
  diagnosticar = () => {},
}) {
  const redirectTo = construirRedirectTo(portalDestino);

  if (!redirectTo) {
    throw new AdminRecoverySendError("Portal de destino inválido.", "INVALID_PORTAL");
  }

  let data;
  let errorGeneracion;

  try {
    ({ data, error: errorGeneracion } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    }));
  } catch (excepcionGeneracion) {
    errorGeneracion = excepcionGeneracion;
  }

  if (errorGeneracion) {
    diagnosticar("Error crítico en generación del enlace (admin)", {
      type: errorGeneracion?.name || "AuthError",
      code: errorGeneracion?.code || "RECOVERY_LINK_FAILED",
    });

    throw new AdminRecoverySendError(
      "No fue posible generar el enlace de recuperación.",
      "RECOVERY_LINK_FAILED"
    );
  }

  const enlaceRecuperacion = data?.properties?.action_link;

  if (!enlaceRecuperacion) {
    diagnosticar("Error crítico", "Supabase no generó el enlace de recuperación (admin)");

    throw new AdminRecoverySendError(
      "No fue posible generar el enlace de recuperación.",
      "RECOVERY_LINK_MISSING"
    );
  }

  const enlaceSeguro = escaparHtml(enlaceRecuperacion);

  try {
    await enviarCorreo({
      para: email,
      asunto: "Recuperación de contraseña | ParkFacil",
      html: generarHtmlCorreo(enlaceSeguro),
      texto: `Recupere su contraseña utilizando este enlace: ${enlaceRecuperacion}`,
    });
  } catch (errorEnvio) {
    diagnosticar("Error crítico en envío por Microsoft Graph (admin)", {
      type: errorEnvio?.name || "Error",
      code: errorEnvio?.code || "GRAPH_SEND_FAILED",
    });

    throw new AdminRecoverySendError(
      "No fue posible enviar el correo de recuperación.",
      "GRAPH_SEND_FAILED"
    );
  }

  diagnosticar("Resultado del envío (admin)", "correo enviado mediante Microsoft 365");

  return { ok: true };
}
