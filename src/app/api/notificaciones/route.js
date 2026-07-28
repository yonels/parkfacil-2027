import { NextResponse } from "next/server";
import { getSupabaseAdminClient, isSupabaseConfigurationError } from "@/lib/supabaseServer";
import { getNotificationProvidersStatus, listNotifications, getNotificationSummary, normalizeNotificationFilters, NotificationValidationError } from "@/lib/notifications";

export const dynamic = "force-dynamic";

function emptyResponse(searchParams) {
  const filters = normalizeNotificationFilters(Object.fromEntries(searchParams.entries()));
  return NextResponse.json({
    data: [],
    pagination: { page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 1 },
    summary: { total: 0, pending: 0, sent: 0, delivered: 0, failed: 0 },
    providers: getNotificationProvidersStatus(),
    unavailable: true,
  });
}

function isMissingNotificationsTable(error) {
  return ["42P01", "PGRST205", "PGRST116"].includes(error?.code) || /notifications/i.test(error?.message || "") && /schema cache|does not exist|not found/i.test(error?.message || "");
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  try {
    const supabase = getSupabaseAdminClient();
    const rawFilters = Object.fromEntries(searchParams.entries());
    const [list, summary] = await Promise.all([
      listNotifications(supabase, rawFilters),
      getNotificationSummary(supabase, rawFilters),
    ]);
    return NextResponse.json({ ...list, summary, providers: getNotificationProvidersStatus() });
  } catch (error) {
    if (error instanceof NotificationValidationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status || 400 });
    if (isSupabaseConfigurationError(error) || isMissingNotificationsTable(error)) return emptyResponse(searchParams);
    console.error("Error al listar notificaciones:", error?.message || error);
    return NextResponse.json({ error: "No fue posible cargar notificaciones." }, { status: 500 });
  }
}