import "server-only";
import { NextResponse } from "next/server";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePermission, requirePlatformAdmin } from "@/lib/auth/apiAuthorizationCore.mjs";

// Autorización común de /api/centro-sms/* (SOL-2026-10-29-007): sesión
// válida + Portal Root + el permiso sms:* específico de la acción. Mientras
// el módulo sea solo de Root, ambas comprobaciones deben pasar.
export async function authorizeSmsRequest(request, permission) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization;
  try {
    requirePlatformAdmin(authorization.context);
    requirePermission(authorization.context, permission);
    return authorization;
  } catch (error) {
    return { context: authorization.context, response: authorizationErrorResponse(request, error, authorization.context) };
  }
}

const SMS_ERROR_MESSAGES = {
  SMS_VALIDATION_ERROR: "Revisa los campos indicados.",
  SMS_CONFIRMATION_REQUIRED: "Debes confirmar explícitamente la operación.",
  SMS_REQUEST_ID_INVALID: "Solicitud inválida; recarga la página e intenta nuevamente.",
  SMS_PHONE_INVALID: "El número no es un celular chileno válido.",
  SMS_TEST_PHONE_NOT_AUTHORIZED: "Ese número no está autorizado para pruebas (Configuración y permisos).",
  SMS_TEST_COOLDOWN: "Espera antes de enviar otra prueba.",
  SMS_RATE_LIMITED: "Se alcanzó el límite de envíos por hora.",
  SMS_CANCEL_NOT_ALLOWED: "Solo se pueden cancelar mensajes que aún no se envían.",
  SMS_NOT_FOUND: "No se encontró el mensaje.",
};

// Respuesta de error uniforme: filtros inválidos => 400 con el campo; el
// resto => mensaje genérico sin detalles internos (se registran en servidor).
export function smsErrorResponse(error, logTag, message) {
  if (error?.code === "SMS_FILTER_INVALID") return NextResponse.json({ error: "Revisa los filtros indicados.", code: error.code, field: error.field }, { status: 400 });
  if (error?.status && error.status < 500 && error.code) {
    return NextResponse.json({ error: error.userMessage || SMS_ERROR_MESSAGES[error.code] || message, code: error.code, ...(error.details ? { details: error.details } : {}), ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) }, { status: error.status });
  }
  console.error(`[centro-sms:${logTag}]`, error?.code || error?.message || error);
  return NextResponse.json({ error: message, code: "SMS_CENTER_ERROR" }, { status: 500 });
}
