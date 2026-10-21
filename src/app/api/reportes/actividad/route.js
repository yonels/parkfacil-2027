import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationActor, operationAuthorizationError } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { searchActivityReport } from "@/lib/posStaysService";
import { validateReportFilters } from "@/lib/pos/activityReportCore.mjs";
import { listParkings } from "@/lib/estacionamientosRepository";

function fail(message, status = 400, details) {
  return NextResponse.json({ error: message, details }, { status });
}

// Consulta real de actividad (Ingresos/Salidas/Vehículos pendientes/
// Anulados + medio de pago) para el modal de detalle de /modelo-dashboard.
// Usa exactamente el mismo patrón de autorización y aislamiento que
// /api/pos/stays y /api/pos/payments (authorizeOperationRequest,
// authorization.scope = parkingQueryScope) — nunca se entregan datos de
// otra empresa/estacionamiento. Requiere REPORTS_READ (no se otorga a
// operadores del POS: es una capacidad de consulta/gestión, no operativa).
export async function GET(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.REPORTS_READ);
    if (authorization.response) return authorization.response;

    const url = new URL(request.url);
    const activity = url.searchParams.get("activity") || null;
    const parkingId = url.searchParams.get("parkingId") || null;
    const dateFrom = url.searchParams.get("dateFrom") || null;
    const dateTo = url.searchParams.get("dateTo") || null;
    const paymentMethod = url.searchParams.get("paymentMethod") || null;
    const page = url.searchParams.get("page");
    const pageSize = url.searchParams.get("pageSize");

    const validation = validateReportFilters({ activity, dateFrom, dateTo, paymentMethod });
    if (!validation.ok) return fail(validation.message, 400, { code: "INVALID_FILTERS" });

    // Mismo aislamiento por empresa/estacionamiento que /api/estacionamientos
    // (listParkings + authorization.scope) — se resuelve aquí, en la capa de
    // ruta, y se pasa ya resuelto a searchActivityReport (ver comentario en
    // posStaysService.js sobre por qué esa función no importa
    // estacionamientosRepository directamente).
    const scopedParkings = await listParkings(authorization.db, authorization.scope);
    const result = await searchActivityReport(authorization.db, scopedParkings, {
      activity,
      parkingId,
      dateFrom,
      dateTo,
      paymentMethod,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });

    return NextResponse.json({
      data: {
        rows: result.rows,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        parkings: result.parkings,
        actor: operationActor(authorization.context),
      },
    });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    return fail("No fue posible consultar la actividad solicitada.", 503);
  }
}
