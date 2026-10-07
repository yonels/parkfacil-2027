import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationActor, operationAuthorizationError } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getRevenueOverview, RevenueRangeTooWideError, searchRevenueTransactions } from "@/lib/offStreetRevenueService";
import { validateRevenueFilters } from "@/lib/offStreetRevenueCore.mjs";
import { listParkings } from "@/lib/estacionamientosRepository";

function fail(message, status = 400, details) {
  return NextResponse.json({ error: message, details }, { status });
}

// Reemplazo real de /recaudacion (antes datos demo: transactions/closures/
// dailyRevenueBase/companyProfiles). Mismo patrón de autorización y
// aislamiento que /api/reportes/actividad y /api/operacion (Fase 1):
// authorizeOperationRequest + listParkings(db, authorization.scope).
//
// A diferencia de /api/operacion (Fase 1), aquí SOLO se acepta REPORTS_READ
// -- no se extiende a OPERATIONS_USE. Antes de escribir código se revisó
// permissions.mjs: ROLES.OPERATOR nunca tuvo REPORTS_READ y /recaudacion es
// una pantalla de conciliación financiera (mismo permiso que ya exige
// /api/reportes/actividad), no una tarea operativa diaria como /operacion.
// No hay evidencia de que /recaudacion deba estar disponible para
// operadores hoy, así que no se amplía el permiso "por conveniencia".
//
// El resumen (§5 de la auditoría forense) recibe LOS MISMOS filtros de
// empresa/estacionamiento/fecha/medio de pago/operador que la tabla -- solo
// `query` (búsqueda de texto libre) queda fuera a propósito (documentado en
// offStreetRevenueService.getRevenueOverview).
//
// `all=true` (exportación CSV completa, Opción A de la auditoría): devuelve
// el conjunto COMPLETO que corresponde a los filtros (mismo scope, mismo
// tope no-silencioso), no solo la página visible.
export async function GET(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.REPORTS_READ);
    if (authorization.response) return authorization.response;

    const url = new URL(request.url);
    const parkingId = url.searchParams.get("parkingId") || null;
    const companyId = url.searchParams.get("companyId") || null;
    const dateFrom = url.searchParams.get("dateFrom") || null;
    const dateTo = url.searchParams.get("dateTo") || null;
    const paymentMethod = url.searchParams.get("paymentMethod") || null;
    const operatorId = url.searchParams.get("operatorId") || null;
    const query = url.searchParams.get("query") || null;
    const page = url.searchParams.get("page");
    const pageSize = url.searchParams.get("pageSize");
    const all = url.searchParams.get("all") === "true";

    const validation = validateRevenueFilters({ dateFrom, dateTo, paymentMethod });
    if (!validation.ok) return fail(validation.message, 400, { code: "INVALID_FILTERS" });
    if (all && !dateFrom && !dateTo) {
      return fail("Selecciona un rango de fechas antes de exportar todo el resultado.", 400, { code: "EXPORT_REQUIRES_DATE_RANGE" });
    }

    const scopedParkings = await listParkings(authorization.db, authorization.scope);
    const [result, overview] = await Promise.all([
      searchRevenueTransactions(authorization.db, scopedParkings, {
        parkingId,
        companyId,
        dateFrom,
        dateTo,
        paymentMethod,
        operatorId,
        query,
        all,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      }),
      getRevenueOverview(authorization.db, scopedParkings, { parkingId, companyId, dateFrom, dateTo, paymentMethod, operatorId }),
    ]);

    return NextResponse.json({
      data: {
        resumen: overview.summary,
        serieDiaria: overview.dailySeries,
        diferenciasCaja: overview.cashDifference,
        periodo: { dateFrom: overview.dateFrom, dateTo: overview.dateTo },
        rows: result.rows,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        all,
        parkings: result.parkings,
        companies: result.companies,
        actor: operationActor(authorization.context),
      },
    });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    if (error instanceof RevenueRangeTooWideError) {
      return fail("El rango de fechas o filtros seleccionados incluye demasiados registros. Acótalo e intenta nuevamente.", 400, { code: error.code });
    }
    return fail("No fue posible consultar la recaudación solicitada.", 503);
  }
}
