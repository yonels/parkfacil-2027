import { NextResponse } from "next/server";
import { authorizeInspectorRequest } from "@/lib/auth/inspectorAuthorization";
import { normalizeInspectorPlate } from "@/lib/inspector/inspectorMocks.mjs";
import { findOnStreetPlateState } from "@/lib/inspector/inspectorRepository";

// Consulta de patente On-Street acotada a la empresa del inspector
// (SOL-2026-11-16-003; antes global, Etapa 2 §3.1/§5): autentica,
// verifica rol Inspector/permiso, normaliza la patente server-side y
// consulta datos reales de su empresa (authorization.scope), sin otro filtro por
// área/sector/calle/tramo.
export async function GET(request, { params }) {
  const authorization = await authorizeInspectorRequest(request);
  if (authorization.response) return authorization.response;

  const { plate: rawPlate } = await params;
  const plate = normalizeInspectorPlate(decodeURIComponent(String(rawPlate || "")));
  if (!plate) return NextResponse.json({ error: "Patente no válida." }, { status: 400 });

  try {
    const state = await findOnStreetPlateState(plate, authorization.db, authorization.scope);
    return NextResponse.json({ data: state });
  } catch {
    return NextResponse.json({ error: "No fue posible consultar la patente." }, { status: 503 });
  }
}
