import { NextResponse } from "next/server";
import { authorizeInspectorRequest } from "@/lib/auth/inspectorAuthorization";
import { normalizeInspectorPlate } from "@/lib/inspector/inspectorMocks.mjs";
import { findOnStreetPlateState } from "@/lib/inspector/inspectorRepository";

// Consulta GLOBAL de patente On-Street (Etapa 2, §3.1/§5): autentica,
// verifica rol Inspector/permiso, normaliza la patente server-side y
// consulta datos reales -- deliberadamente sin ningún filtro por
// estacionamiento/área/sector/calle/tramo/empresa.
export async function GET(request, { params }) {
  const authorization = await authorizeInspectorRequest(request);
  if (authorization.response) return authorization.response;

  const { plate: rawPlate } = await params;
  const plate = normalizeInspectorPlate(decodeURIComponent(String(rawPlate || "")));
  if (!plate) return NextResponse.json({ error: "Patente no válida." }, { status: 400 });

  try {
    const state = await findOnStreetPlateState(plate, authorization.db);
    return NextResponse.json({ data: state });
  } catch {
    return NextResponse.json({ error: "No fue posible consultar la patente." }, { status: 503 });
  }
}
