import { NextResponse } from "next/server";
import { authorizeInspectorRequest } from "@/lib/auth/inspectorAuthorization";
import { normalizeInspectorPlate } from "@/lib/inspector/inspectorMocks.mjs";
import { findOnStreetPlateState } from "@/lib/inspector/inspectorRepository";
import { registerOnStreetInspection } from "@/lib/inspector/inspectorInspectionService";
import { listInspectorInspections } from "@/lib/inspector/inspectorRepository";

const INSPECTION_TYPES = ["OVERSTAY", "NO_SESSION", "OTHER"];

function fail(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Registro real de fiscalización (Etapa 2, §9/§13). idempotency-key va en
// la cabecera (mismo criterio ya usado por payment-intents/webpay) --
// requerida siempre, un doble click/reintento con la MISMA clave nunca
// duplica el registro ni reenvía el SMS (ver register_on_street_inspection
// y sendInspectionSmsIfNeeded).
export async function POST(request) {
  const authorization = await authorizeInspectorRequest(request);
  if (authorization.response) return authorization.response;

  const idempotencyKey = request.headers.get("idempotency-key") || "";
  if (idempotencyKey.length < 8) return fail("Falta la clave de idempotencia.");

  let body;
  try { body = await request.json(); } catch { return fail("Cuerpo inválido."); }

  const plate = normalizeInspectorPlate(body?.plate);
  if (!plate) return fail("Patente no válida.");
  const inspectionType = String(body?.inspectionType || "");
  if (!INSPECTION_TYPES.includes(inspectionType)) return fail("Tipo de fiscalización no válido.");

  try {
    let sessionId = null;
    if (inspectionType === "OVERSTAY") {
      // Regla crítica (§9): la sesión a fiscalizar se re-resuelve SIEMPRE
      // aquí, desde la patente -- nunca se acepta un sessionId enviado por
      // el cliente. Si la patente ya no está VENCIDO (p. ej. se pagó una
      // extensión mientras el inspector completaba el formulario), se
      // rechaza en vez de fiscalizar con datos obsoletos.
      const state = await findOnStreetPlateState(plate, authorization.db);
      if (state.status !== "VENCIDO") return fail("No existe una sesión vencida fiscalizable para esta patente.", 409);
      sessionId = state.sessionId;
    }

    const result = await registerOnStreetInspection(authorization.db, {
      idempotencyKey,
      plate,
      sessionId,
      inspectorUserId: authorization.context.userId,
      inspectionType,
      vehicleStillPresent: Boolean(body?.vehicleStillPresent),
      observations: body?.observations,
      latitude: typeof body?.latitude === "number" ? body.latitude : null,
      longitude: typeof body?.longitude === "number" ? body.longitude : null,
      // Contexto territorial (Etapa 3, §13/§14): solo relevante para
      // NO_SESSION/OTHER -- registerOnStreetInspection lo ignora para
      // OVERSTAY (la sesión real ya es la única fuente de verdad) y
      // re-verifica cualquier id recibido contra la base de datos.
      contextParkingId: typeof body?.contextParkingId === "string" ? body.contextParkingId : null,
      contextQrLocationId: typeof body?.contextQrLocationId === "string" ? body.contextQrLocationId : null,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (cause) {
    const status = Number(cause?.status) || 503;
    return fail(status < 500 ? cause.message : "No fue posible registrar la fiscalización.", status < 500 ? status : 503);
  }
}

// Historial real del inspector autenticado (Etapa 2, §15): únicamente sus
// propias fiscalizaciones.
export async function GET(request) {
  const authorization = await authorizeInspectorRequest(request);
  if (authorization.response) return authorization.response;
  try {
    const data = await listInspectorInspections(authorization.context.userId, authorization.db);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "No fue posible cargar el historial." }, { status: 503 });
  }
}
