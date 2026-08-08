import { NextResponse } from "next/server";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { listAuthorizedUsers } from "@/lib/usersRepository";

export async function GET(request, { params }) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try {
    requirePermission(authorization.context, PERMISSIONS.USERS_MANAGE);
  } catch (error) {
    return authorizationErrorResponse(request, error, authorization.context);
  }

  const { id } = await params;
  const db = getSupabaseAdminClient();
  try {
    const result = await listAuthorizedUsers(db, authorization.context);
    const user = result.data.find((item) => item.id === id) || null;
    if (!user) {
      return NextResponse.json({ error: "No se encontro el usuario solicitado.", code: "USER_NOT_FOUND" }, { status: 404 });
    }

    const parkingIds = Array.isArray(user.estacionamientos) ? user.estacionamientos.filter(Boolean) : [];
    if (!parkingIds.length) {
      return NextResponse.json({ data: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    const shiftsResult = await db
      .from("operator_shifts")
      .select("id,parking_id,assignment_id,shift_date,scheduled_start,scheduled_end,status,opened_at,closed_at")
      .eq("operator_id", id)
      .in("parking_id", parkingIds)
      .order("shift_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (shiftsResult.error) throw shiftsResult.error;

    const parkingById = new Map(result.parkings.map((item) => [item.id, item]));
    const data = (shiftsResult.data || []).map((shift) => {
      const parking = parkingById.get(shift.parking_id);
      return {
        id: shift.id,
        parkingId: shift.parking_id,
        parkingCode: parking?.codigo || shift.parking_id,
        parkingName: parking?.nombre || "Estacionamiento",
        assignmentId: shift.assignment_id,
        date: shift.shift_date,
        scheduledStart: shift.scheduled_start,
        scheduledEnd: shift.scheduled_end,
        status: shift.status,
        openedAt: shift.opened_at,
        closedAt: shift.closed_at,
      };
    });

    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[users:shifts:list]", error);
    return NextResponse.json({ error: "No fue posible obtener los turnos del usuario.", code: "USER_SHIFTS_READ_FAILED" }, { status: 500 });
  }
}