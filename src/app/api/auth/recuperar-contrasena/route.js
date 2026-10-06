import { recoveryReadiness, resolveRecoveryRequest } from "@/lib/passwordRecoveryReadiness.mjs";
import { NextResponse } from "next/server";

import { enviarCorreoMicrosoft } from "@/lib/mailService";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import {
  RESPUESTA_ERROR,
  esEntornoLocal,
  procesarRecuperacionContrasena,
  resolverCanalEntregaRecuperacion,
} from "@/lib/passwordRecoveryCore.mjs";

const MODO_DIAGNOSTICO = false;

function diagnostico(etiqueta, valor = "") {
  if (!MODO_DIAGNOSTICO) {
    return;
  }

  console.log(`[RECUPERAR CONTRASEÑA] ${etiqueta}`, valor);
}

function obtenerHostSolicitud(request) {
  const forwardedHost = request.headers.get("x-forwarded-host");

  return String(forwardedHost || request.headers.get("host") || "");
}

export async function POST(request) {
  diagnostico("================================");
  diagnostico("Inicio de solicitud:", new Date().toISOString());

  try {
    const host = obtenerHostSolicitud(request);
    const portalPrueba = request.headers.get("x-parkfacil-portal");
    const local = esEntornoLocal(host);

    // Nota: el header x-parkfacil-portal SOLO tiene efecto cuando el
    // host es localhost/127.0.0.1 (ver detectarPortal). No permite
    // suplantar el portal en producción.
    const body = await request.json().catch(() => ({}));
    const resolved = resolveRecoveryRequest({ host, portalPrueba, requestedPortal: body?.portal });
    const portal = resolved.portal;
    // origin real de la solicitud (protocolo+host+puerto tal cual llegó,
    // p. ej. "http://localhost:3000") -- solo se usa cuando local=true,
    // para que el enlace de recuperación apunte exactamente al servidor
    // dev que realmente está sirviendo la solicitud, sin un puerto
    // hardcodeado que pudiera no coincidir.
    const redirectTo = local ? `${new URL(request.url).origin}/nueva-contrasena` : resolved.redirectTo;

    diagnostico("Entorno detectado:", host);
    diagnostico("Portal identificado:", portal);
    diagnostico("Entorno local:", local);

    // Canal de entrega del correo (Mailpit vs Microsoft Graph): se resuelve
    // de forma explícita vía PASSWORD_RECOVERY_DELIVERY, independiente del
    // host de la solicitud (ver resolverCanalEntregaRecuperacion). Un valor
    // ausente/inválido en Producción falla aquí mismo, de forma explícita
    // -- nunca cae en silencio a Mailpit.
    let canalEntrega;

    try {
      canalEntrega = resolverCanalEntregaRecuperacion({
        valorEnv: process.env.PASSWORD_RECOVERY_DELIVERY,
      });
    } catch (errorCanal) {
      console.error("[RECUPERAR CONTRASEÑA] Configuración de canal de entrega inválida", {
        type: errorCanal?.name || "Error",
        code: errorCanal?.code || "PASSWORD_RECOVERY_DELIVERY_INVALID",
      });

      return NextResponse.json(
        { ok: false, mensaje: RESPUESTA_ERROR },
        { status: 500 }
      );
    }

    diagnostico("Canal de entrega:", canalEntrega);

    if (!local) {
      const readiness = recoveryReadiness();
      if (!readiness.ok) {
        console.error("[access:recovery:failed]", { code: "RECOVERY_CONFIGURATION_INVALID", problems: readiness.problems });
        return NextResponse.json({ ok: false, mensaje: RESPUESTA_ERROR }, { status: 503 });
      }
    }
    const supabase = getSupabaseAdminClient();

    const resultado = await procesarRecuperacionContrasena({
      portal,
      redirectTo,
      loginIdentifier: body?.loginIdentifier ?? body?.email,
      supabase,
      enviarCorreo: enviarCorreoMicrosoft,
      canalEntrega,
      diagnosticar: diagnostico,
    });

    if (!resultado.ok) console.error("[access:recovery:failed]", { code: "RECOVERY_REQUEST_FAILED", status: resultado.status });
    return NextResponse.json(
      {
        ok: resultado.ok,
        mensaje: resultado.mensaje,
      },
      {
        status: resultado.status,
      }
    );
  } catch (error) {
    console.error("[RECUPERAR CONTRASEÑA] Error interno", {
      type: error?.name || "Error",
      code: error?.code || "RECOVERY_REQUEST_FAILED",
      status: error?.status || null,
    });

    return NextResponse.json(
      {
        ok: false,
        mensaje: RESPUESTA_ERROR,
      },
      {
        status: 500,
      }
    );
  } finally {
    diagnostico("Fin de solicitud");
    diagnostico("================================");
  }
}
