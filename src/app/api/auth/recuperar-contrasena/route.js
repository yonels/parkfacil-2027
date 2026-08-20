import { NextResponse } from "next/server";

import { enviarCorreoMicrosoft } from "@/lib/mailService";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import {
  RESPUESTA_ERROR,
  construirRedirectTo,
  detectarPortal,
  procesarRecuperacionContrasena,
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

    // Nota: el header x-parkfacil-portal SOLO tiene efecto cuando el
    // host es localhost/127.0.0.1 (ver detectarPortal). No permite
    // suplantar el portal en producción.
    const portal = detectarPortal({ host, portalPrueba });
    const redirectTo = construirRedirectTo(portal);

    diagnostico("Entorno detectado:", host);
    diagnostico("Portal identificado:", portal);

    const body = await request.json().catch(() => ({}));

    const supabase = getSupabaseAdminClient();

    const resultado = await procesarRecuperacionContrasena({
      portal,
      redirectTo,
      email: body?.email,
      supabase,
      enviarCorreo: enviarCorreoMicrosoft,
      diagnosticar: diagnostico,
    });

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
