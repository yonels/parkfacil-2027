import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationActor, operationAuthorizationError } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { RevenueRangeTooWideError } from "@/lib/offStreetRevenueService";
import { getOffStreetDashboardOverview } from "@/lib/offStreetDashboardService";
import { getDashboardCapacity } from "@/lib/offStreetDashboardCapacity";
import { computeOccupancy, validateDashboardFilters } from "@/lib/offStreetDashboardCore.mjs";
import { listParkings } from "@/lib/estacionamientosRepository";

function fail(message, status = 400, details) {
  return NextResponse.json({ error: message, details }, { status });
}

// Dashboard Off Street real (Fase 3) -- payload consolidado en una sola
// consulta para mantener coherencia temporal entre bloques (mismo `now` y
// mismo rango de fechas para operación/recaudación/turnos/gráfico). Mismo
// patrón de autorización y aislamiento que /api/operacion y /api/recaudacion
// (Fase 1/2): authorizeOperationRequest + listParkings(db,
// authorization.scope). Solo REPORTS_READ -- no se amplía a OPERATIONS_USE
// (mismo criterio que /api/recaudacion: pantalla ejecutiva/administrativa,
// no operativa diaria; ROLES.OPERATOR nunca tuvo REPORTS_READ).
//
// getOffStreetDashboardOverview (operación/recaudación/turnos/cierres/
// gráfico) y getDashboardCapacity (niveles/zonas reales) se resuelven en
// paralelo -- dominios independientes, sin dependencia entre sí.
export async function GET(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.REPORTS_READ);
    if (authorization.response) return authorization.response;

    const url = new URL(request.url);
    const parkingId = url.searchParams.get("parkingId") || null;
    const companyId = url.searchParams.get("companyId") || null;
    const period = url.searchParams.get("period") || null;
    const dateFrom = url.searchParams.get("dateFrom") || null;
    const dateTo = url.searchParams.get("dateTo") || null;

    const validation = validateDashboardFilters({ dateFrom, dateTo, period });
    if (!validation.ok) return fail(validation.message, 400, { code: "INVALID_FILTERS" });

    const scopedParkings = await listParkings(authorization.db, authorization.scope);
    const offStreetInScope = scopedParkings.filter((parking) => parking.type === "OFF_STREET");

    // Capacidad (§8): resuelta para los parkings que realmente calzan con
    // empresa/estacionamiento filtrados -- se recorta con el mismo criterio
    // (companyId/parkingId) antes de sumar niveles/zonas, para no sumar
    // capacidad de estacionamientos fuera del filtro visible.
    const capacityScope = parkingId
      ? offStreetInScope.filter((parking) => parking.id === parkingId || parking.code === parkingId)
      : companyId
        ? offStreetInScope.filter((parking) => parking.companyId === companyId)
        : offStreetInScope;

    const [overview, capacity] = await Promise.all([
      getOffStreetDashboardOverview(authorization.db, scopedParkings, { parkingId, companyId, period, dateFrom, dateTo, capacity: 0 }),
      getDashboardCapacity(authorization.db, capacityScope),
    ]);

    return NextResponse.json({
      data: {
        ...overview,
        // La ocupación real se resuelve aquí (no dentro de
        // getOffStreetDashboardOverview) porque su capacidad
        // (getDashboardCapacity) se calcula en paralelo, en un dominio
        // aparte -- computeOccupancy es la MISMA función pura que ya usa el
        // orquestador, nunca se reimplementa la fórmula.
        occupancy: computeOccupancy({ capacity, insideCount: overview.operations.vehiculosDentro }),
        actor: operationActor(authorization.context),
      },
    });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    if (error instanceof RevenueRangeTooWideError) {
      return fail("El rango de fechas seleccionado incluye demasiados registros. Acótalo e intenta nuevamente.", 400, { code: error.code });
    }
    return fail("No fue posible consultar el dashboard Off Street.", 503);
  }
}
