import { NextResponse } from "next/server";
import { isPublicToken } from "@/lib/onStreetPilot.mjs";
import { getPublicPilotSession } from "@/lib/onStreetPilotRepository";
const headers = { "Cache-Control": "no-store" };
export async function GET(_request, { params }) {
  const { token } = await params;
  if (!isPublicToken(token)) return NextResponse.json({ error: "Sesión no encontrada." }, { status: 404, headers });
  try { const data = await getPublicPilotSession(token); return data ? NextResponse.json({ data: { session: { licensePlate:data.session.license_plate_normalized,status:data.session.status,startedAt:data.session.started_at,endedAt:data.session.ended_at,durationSeconds:data.session.duration_seconds,purchasedMinutes:data.session.purchased_minutes,ratePerMinute:Number(data.session.rate_per_minute),amountPaid:Number(data.session.amount_paid??data.session.simulated_amount),expiresAt:data.session.expires_at,extensionCount:data.extensions.length }, location: { parkingName:data.location.parking.name,sectorName:data.location.sector.name,streetName:data.location.street.name,segmentName:data.location.segment.name,operatorEmail:data.location.company?.email } } }, { headers }) : NextResponse.json({ error: "Sesión no encontrada." }, { status: 404, headers }); }
  catch { return NextResponse.json({ error: "No fue posible consultar la sesión." }, { status: 503, headers }); }
}
