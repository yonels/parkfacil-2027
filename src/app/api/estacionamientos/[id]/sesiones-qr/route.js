import { NextResponse } from "next/server";
import { authorizeParkingRequest } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { maskPhone } from "@/lib/onStreetPilot.mjs";
import { listParkingPilotSessions } from "@/lib/onStreetPilotRepository";

export async function GET(request, { params }) {
  const { id } = await params;
  const authorization = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_READ);
  if (authorization.response) return authorization.response;
  if (authorization.parking.type !== "ON_STREET") return NextResponse.json({ error: "Sesiones QR solo está disponible para estacionamientos On Street." }, { status: 409 });
  try {
    const rows = await listParkingPilotSessions(authorization.db, authorization.parking.id);
    return NextResponse.json({ data: rows.map((row) => ({
      id: row.id, sector: row.sector ? `${row.sector.code} · ${row.sector.name}` : "Sector no disponible",
      street: row.street?.name || "Calle no disponible", segment: row.segment ? `${row.segment.code} · ${row.segment.name}` : "Tramo no disponible",
      phone: maskPhone(row.phone_normalized), startedAt: row.started_at, endedAt: row.ended_at, durationSeconds: row.duration_seconds,
      status: row.status, originalMinutes: row.original_minutes, purchasedMinutes: row.purchased_minutes, expiresAt: row.expires_at,
      ratePerMinute: Number(row.rate_per_minute || 0), initialSimulatedAmount: row.initial_simulated_amount,
      simulatedAmount: row.simulated_amount, extensionCount: row.extension_count,
      extensions: row.extensions.map((extension) => ({ id: extension.id, createdAt: extension.created_at,
        additionalMinutes: extension.additional_minutes, ratePerMinute: Number(extension.rate_per_minute || 0),
        simulatedAmount: extension.simulated_amount, previousExpiresAt: extension.previous_expires_at,
        newExpiresAt: extension.new_expires_at, sessionId: extension.session_id })),
      notifications: row.notifications.map((notification) => ({ id: notification.id, type: notification.type,
        scheduledAt: notification.scheduled_at, sentAt: notification.sent_at, status: notification.status,
        attempts: notification.attempts })),
    })) });
  } catch { return NextResponse.json({ error: "No fue posible cargar las sesiones QR." }, { status: 503 }); }
}
