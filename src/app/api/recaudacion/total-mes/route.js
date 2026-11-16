import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationAuthorizationError } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getMonthlyRevenueTotal, RevenueRangeTooWideError } from "@/lib/offStreetRevenueService";
import { isValidIsoMonth } from "@/lib/offStreetRevenueCore.mjs";
import { listParkings } from "@/lib/estacionamientosRepository";

function fail(message, status = 400, details) {
  return NextResponse.json({ error: message, details }, { status });
}

// Total recaudado del mes para el encabezado de Reportes Off Street ›
// Recaudación (SOL-2026-10-27-002). Mismo patrón de autorización y
// aislamiento que /api/recaudacion (REPORTS_READ + listParkings con el scope
// del actor): el total nunca incluye otra empresa ni parkings On Street.
export async function GET(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.REPORTS_READ);
    if (authorization.response) return authorization.response;

    const url = new URL(request.url);
    const parkingId = url.searchParams.get("parkingId") || null;
    const companyId = url.searchParams.get("companyId") || null;
    const month = url.searchParams.get("month") || null;
    if (month && !isValidIsoMonth(month)) return fail("month debe tener formato AAAA-MM.", 400, { code: "INVALID_FILTERS" });

    const scopedParkings = await listParkings(authorization.db, authorization.scope);
    const totalMes = await getMonthlyRevenueTotal(authorization.db, scopedParkings, { parkingId, companyId, month });
    return NextResponse.json({ data: totalMes });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    if (error instanceof RevenueRangeTooWideError) {
      return fail("El mes seleccionado incluye demasiados registros para calcular el total.", 400, { code: error.code });
    }
    return fail("No fue posible calcular el total recaudado del mes.", 503);
  }
}
