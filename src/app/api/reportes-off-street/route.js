import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationActor, operationAuthorizationError } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { offStreetParkings, resolveQueryParkingIds, RevenueRangeTooWideError } from "@/lib/offStreetRevenueService";
import { getMovementsSummary, getOpenCountsByParking, searchMovementsReport, searchShiftsReport } from "@/lib/offStreetReportsService";
import { getDashboardCapacityByParking } from "@/lib/offStreetDashboardCapacity";
import { toOccupancyReportRow, validateReportsFilters } from "@/lib/offStreetReportsCore.mjs";
import { listParkings } from "@/lib/estacionamientosRepository";
import { searchCouponRedemptions } from "@/lib/cupones/couponReportsService";
import { COUPONS_DISABLED_ERROR, couponsEnabled } from "@/lib/cupones/couponsAvailability.mjs";
import { validateStreetReportFilters } from "@/lib/offStreet/streetReportsCore.mjs";
import { streetMovementsReport, streetOccupancyReport, streetSummaryReport } from "@/lib/offStreet/streetReportsService";

function fail(message, status = 400, details) {
  return NextResponse.json({ error: message, details }, { status });
}

// Reportes Off Street (Fase 4) -- Recaudación y Cierres NO tienen ruta aquí:
// el frontend reutiliza /api/recaudacion y /api/recaudacion/cierres (Fase 2)
// directamente. Esta ruta cubre los 4 reportes restantes (movements/parked/
// shifts/occupancy), un solo punto de autorización+scope, dispatch por
// `type`. Mismo patrón que /api/recaudacion y /api/dashboard-off-street:
// authorizeOperationRequest + listParkings(db, authorization.scope), SOLO
// REPORTS_READ (sin OPERATIONS_USE).
export async function GET(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.REPORTS_READ);
    if (authorization.response) return authorization.response;

    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "movements";
    const parkingId = url.searchParams.get("parkingId") || null;
    const companyId = url.searchParams.get("companyId") || null;
    const dateFrom = url.searchParams.get("dateFrom") || null;
    const dateTo = url.searchParams.get("dateTo") || null;
    const status = url.searchParams.get("status") || null;
    const movement = url.searchParams.get("movement") || null;
    const activeOnly = url.searchParams.get("current") === "true";
    const operatorId = url.searchParams.get("operatorId") || null;
    const query = url.searchParams.get("query") || null;
    const page = url.searchParams.get("page");
    const pageSize = url.searchParams.get("pageSize");
    const all = url.searchParams.get("all") === "true";

    const validation = validateReportsFilters({ type, dateFrom, dateTo, status, movement });
    if (!validation.ok) return fail(validation.message, 400, { code: "INVALID_FILTERS" });
    const streetView = url.searchParams.get("view") || "occupancy";
    const groupBy = url.searchParams.get("groupBy") || "segment";
    if (type === "streets") {
      const streetValidation = validateStreetReportFilters({ view: streetView, groupBy });
      if (!streetValidation.ok) return fail(streetValidation.message, 400, { code: "INVALID_FILTERS" });
    }
    if (all && !["occupancy", "parked"].includes(type) && !(type === "streets" && streetView === "occupancy") && !(type === "shifts" && ["OPEN", "CLOSING"].includes(status)) && !dateFrom && !dateTo) {
      return fail("Selecciona un rango de fechas antes de exportar todo el resultado.", 400, { code: "EXPORT_REQUIRES_DATE_RANGE" });
    }

    const scopedParkings = await listParkings(authorization.db, authorization.scope);
    const actor = operationActor(authorization.context);

    if (type === "movements" || type === "parked") {
      const forcedStatus = type === "parked" ? "OPEN" : status;
      const [result, summary] = await Promise.all([
        searchMovementsReport(authorization.db, scopedParkings, {
          status: forcedStatus, movement: type === "parked" ? "open" : movement,
          dateFrom: type === "parked" ? null : dateFrom, dateTo: type === "parked" ? null : dateTo, operatorId, query, parkingId, companyId, all,
          page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined,
        }),
        getMovementsSummary(authorization.db, scopedParkings, { parkingId, companyId }),
      ]);
      return NextResponse.json({ data: { rows: result.rows, total: result.total, page: result.page, pageSize: result.pageSize, parkings: result.parkings, resumen: summary, actor } });
    }

    // Cupones (SOL-2026-10-19-002): un canje por fila; solo donde los cupones están habilitados.
    if (type === "coupons") {
      if (!couponsEnabled()) return fail(COUPONS_DISABLED_ERROR.error, 403, { code: COUPONS_DISABLED_ERROR.code });
      const result = await searchCouponRedemptions(authorization.db, scopedParkings, {
        dateFrom, dateTo, parkingId, companyId, all,
        page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined,
      });
      return NextResponse.json({ data: { rows: result.rows, total: result.total, page: result.page, pageSize: result.pageSize, resumen: result.summary, actor } });
    }

    if (type === "shifts") {
      const result = await searchShiftsReport(authorization.db, scopedParkings, {
        status, activeOnly, operatorId, dateFrom, dateTo, parkingId, companyId, all,
        page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined,
      });
      return NextResponse.json({ data: { rows: result.rows, total: result.total, page: result.page, pageSize: result.pageSize, actor } });
    }

    if (type === "occupancy") {
      // Misma resolución real (y el mismo rechazo 404) que transacciones/
      // cierres (Fase 2) y movimientos/turnos (arriba) -- nunca una segunda
      // implementación de "a qué estacionamientos aplica este filtro".
      const { candidateParkings } = resolveQueryParkingIds(offStreetParkings(scopedParkings), { parkingId, companyId });

      const [capacityByParking, openCounts] = await Promise.all([
        getDashboardCapacityByParking(authorization.db, candidateParkings),
        getOpenCountsByParking(authorization.db, candidateParkings.map((p) => p.id)),
      ]);
      const capacityById = new Map(capacityByParking.map((item) => [item.parkingId, item.capacity]));
      const rows = candidateParkings.map((parking) => toOccupancyReportRow(parking, {
        capacity: capacityById.get(parking.id) || 0,
        insideCount: openCounts.get(parking.id) || 0,
      }));
      return NextResponse.json({ data: { rows, total: rows.length, actor } });
    }

    // Calles y tramos (SOL-2026-10-23-001): ocupación actual por tramo, movimientos
    // con ubicación, resumen por zona/calle/tramo/operador y fuera de asignación.
    if (type === "streets") {
      const options = { parkingId, companyId, dateFrom, dateTo, operatorId };
      const result = streetView === "occupancy"
        ? await streetOccupancyReport(authorization.db, scopedParkings, { parkingId, companyId })
        : streetView === "summary"
          ? await streetSummaryReport(authorization.db, scopedParkings, { ...options, groupBy })
          : await streetMovementsReport(authorization.db, scopedParkings, { ...options, outOfAssignmentOnly: streetView === "outOfAssignment" });
      return NextResponse.json({ data: { rows: result.rows, total: result.rows.length, actor } });
    }

    return fail(`type desconocido: ${type}`, 400, { code: "INVALID_FILTERS" });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    if (error instanceof RevenueRangeTooWideError) {
      return fail("El rango de fechas seleccionado incluye demasiados registros. Acótalo e intenta nuevamente.", 400, { code: error.code });
    }
    return fail("No fue posible consultar el reporte solicitado.", 503);
  }
}
