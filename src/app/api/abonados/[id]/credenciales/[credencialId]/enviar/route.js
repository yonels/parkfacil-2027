import { NextResponse } from "next/server";
import { sendAbonadoCredentialEmail, CredentialEmailValidationError } from "@/lib/abonadosCredentialEmail";
import { isMicrosoftGraphConfigurationError, MicrosoftGraphSendError } from "@/lib/microsoftGraphMail";
import { isSupabaseConfigurationError } from "@/lib/supabaseServer";
import { isValidUuid } from "@/lib/abonados";
import { authorizeSubscriberRequest, requireSubscriber, subscriberAuthorizationError } from "@/lib/auth/subscriberAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";

export const dynamic = "force-dynamic";

function jsonError(message, status, details = null) {
  return NextResponse.json({ ok: false, message, details }, { status });
}

function validatePayload(payload = {}) {
  const destinatario = String(payload.destinatario || "").trim();
  const asunto = String(payload.asunto || "").trim();
  const mensaje = String(payload.mensaje || "").trim();
  const errors = {};
  if (!destinatario) errors.destinatario = "El destinatario es obligatorio.";
  if (destinatario && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) errors.destinatario = "El destinatario no es valido.";
  if (asunto.length > 120) errors.asunto = "El asunto no puede superar 120 caracteres.";
  if (mensaje.length > 1000) errors.mensaje = "El mensaje no puede superar 1000 caracteres.";
  return { errors, values: { destinatario, asunto, mensaje } };
}

export async function POST(request, context) {
  let authorization;
  try {
    const params = await context.params;
    const abonadoId = params.id;
    const credencialId = params.credencialId;
    if (!isValidUuid(abonadoId) || !isValidUuid(credencialId)) return jsonError("Identificadores invalidos.", 400);

    authorization = await authorizeSubscriberRequest(request, PERMISSIONS.SUBSCRIBERS_MANAGE);
    if (authorization.response) return authorization.response;
    await requireSubscriber(authorization.db, authorization.context, authorization.scope, abonadoId);
    const credential = await authorization.db.from("abonado_credenciales").select("id").eq("id", credencialId).eq("abonado_id", abonadoId).maybeSingle();
    if (credential.error) throw credential.error;
    if (!credential.data) throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontro la credencial solicitada.", authorization.context);
    const body = await request.json().catch(() => ({}));
    const { errors, values } = validatePayload(body);
    if (Object.keys(errors).length > 0) return jsonError("La solicitud es invalida.", 400, errors);

    const result = await sendAbonadoCredentialEmail({ supabase: authorization.db, abonadoId, credencialId, ...values });
    return NextResponse.json({ ok: true, message: "Correo enviado correctamente.", traceId: result.traceId });
  } catch (error) {
    const denied = subscriberAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    if (isSupabaseConfigurationError(error) || isMicrosoftGraphConfigurationError(error)) {
      return jsonError("Office 365 no esta configurado.", 503, { missingVariables: error.missingVariables || undefined });
    }
    if (error instanceof CredentialEmailValidationError) return jsonError(error.message, error.status || 400);
    if (error instanceof MicrosoftGraphSendError) return jsonError("Microsoft Graph rechazo el envio.", 502, { status: error.status, code: error.code });
    console.error("Error controlado al enviar credencial:", error?.message || error);
    return jsonError("No fue posible enviar la credencial.", 500);
  }
}
