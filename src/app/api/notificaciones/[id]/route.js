import { NextResponse } from "next/server";
import { isSupabaseConfigurationError } from "@/lib/supabaseServer";
import { getNotificationById, listNotificationAttempts } from "@/lib/notifications";
import { authorizeRemainingRequest, notificationScope } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

export const dynamic = "force-dynamic";

function isMissingNotificationsTable(error) {
  return ["42P01", "PGRST205", "PGRST116"].includes(error?.code) || /notifications|notification_attempts/i.test(error?.message || "") && /schema cache|does not exist|not found/i.test(error?.message || "");
}

export async function GET(request, context) {
  try {
    const params = await context.params;
    const authorization = await authorizeRemainingRequest(request, PERMISSIONS.NOTIFICATIONS_READ);
    if (authorization.response) return authorization.response;
    const supabase = authorization.db;
    const notification = await getNotificationById(supabase, params.id, await notificationScope(supabase, authorization.context));
    const attempts = await listNotificationAttempts(supabase, params.id);
    return NextResponse.json({ data: { ...notification, attempts } });
  } catch (error) {
    if (isSupabaseConfigurationError(error) || isMissingNotificationsTable(error)) return NextResponse.json({ error: "El historial de notificaciones aún no está disponible.", unavailable: true }, { status: 404 });
    if (error?.code === "notification_not_found" || /not found|encontrada/i.test(error?.message || "")) return NextResponse.json({ error: "Notificación no encontrada." }, { status: 404 });
    console.error("Error al cargar notificación:", error?.message || error);
    return NextResponse.json({ error: "No fue posible cargar la notificación." }, { status: 500 });
  }
}
