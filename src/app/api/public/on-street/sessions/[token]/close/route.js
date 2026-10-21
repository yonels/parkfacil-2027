import { NextResponse } from "next/server";
import { isPublicToken } from "@/lib/onStreetPilot.mjs";
import { closePilotSession } from "@/lib/onStreetPilotRepository";
const headers = { "Cache-Control": "no-store" };
export async function POST(_request, { params }) {
  const { token } = await params;
  if (!isPublicToken(token)) return NextResponse.json({ error: "Sesión no encontrada." }, { status: 404, headers });
  try { return NextResponse.json({ data: await closePilotSession(token) }, { headers }); }
  catch (error) { return NextResponse.json({ error: error.message?.includes("PILOT_SESSION_NOT_FOUND") ? "Sesión no encontrada." : "No fue posible finalizar el estacionamiento." }, { status: error.message?.includes("PILOT_SESSION_NOT_FOUND") ? 404 : 503, headers }); }
}
