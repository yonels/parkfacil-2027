import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePlatformAdmin } from "@/lib/auth/apiAuthorizationCore.mjs";

// Estado del enrolamiento de una empresa (§12 del encargo "cierre de
// reenvío de enrolamiento"): pendiente/enviado/error de envío/reenviado.
// No agrega ningún estado nuevo en BD -- "reenviado" se deriva de que ya
// exista más de un registro para la misma empresa (company_enrollment_
// notifications), no es una columna nueva.
export async function GET(request, { params }) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try { requirePlatformAdmin(authorization.context); } catch (error) { return authorizationErrorResponse(request, error, authorization.context); }

  const { id } = await params;
  const db = getSupabaseAdminClient();

  const result = await db
    .from("company_enrollment_notifications")
    .select("id,estado,destinatario,error_mensaje,enviado_at,accounts_count,created_at")
    .eq("company_id", id)
    .order("created_at", { ascending: true });
  if (result.error) {
    console.error("[empresas:enrolamiento:estado]", result.error);
    return NextResponse.json({ error: "No fue posible obtener el estado del enrolamiento.", code: "ENROLLMENT_STATUS_READ_FAILED" }, { status: 500 });
  }

  const notifications = result.data || [];
  const latest = notifications[notifications.length - 1] || null;
  // "Reenviado" cuando el último intento exitoso no es el primer registro
  // -- es decir, hubo al menos un intento previo antes de éste.
  const status = !latest ? "pendiente" : latest.estado === "failed" ? "error" : latest.estado === "sent" ? (notifications.length > 1 ? "reenviado" : "enviado") : "pendiente";

  return NextResponse.json({
    data: {
      status,
      latest,
      attempts: notifications.length,
      history: notifications,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
