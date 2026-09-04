import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationActor, operationAuthorizationError } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getOperationsSummary, searchOperationStays } from "@/lib/posStaysService";
import { validateOperationFilters } from "@/lib/offStreetOperationsCore.mjs";
import { listParkings } from "@/lib/estacionamientosRepository";

function fail(message, status = 400, details) {
  return NextResponse.json({ error: message, details }, { status });
}

// Reemplazo real de /operacion (antes demo-data-driven, ver
// src/data/operacion.mjs). Mismo patrón de autorización y aislamiento que
// /api/reportes/actividad (authorizeOperationRequest + listParkings +
// authorization.scope) -- nunca se entregan datos de otra empresa/
// estacionamiento. A diferencia de /api/reportes/actividad (solo
// REPORTS_READ), aquí se acepta también OPERATIONS_USE: navigation.js ya
// expone /operacion a operadores del Portal Cliente (ver activePrefix "Off
// Street"), y un operador con OPERATIONS_USE debe poder verla acotada a sus
// estacionamientos asignados (parkingQueryScope ya lo resuelve así para
// ROLES.OPERATOR) -- no se les otorga REPORTS_READ (permiso de negocio
// distinto, usado por reportes/facturación).
export async function GET(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, [PERMISSIONS.REPORTS_READ, PERMISSIONS.OPERATIONS_USE]);
    if (authorization.response) return authorization.response;

    const url = new URL(request.url);
    const status = url.searchParams.get("status") || null;
    const movement = url.searchParams.get("movement") || null;
    const parkingId = url.searchParams.get("parkingId") || null;
    const companyId = url.searchParams.get("companyId") || null;
    const dateFrom = url.searchParams.get("dateFrom") || null;
    const dateTo = url.searchParams.get("dateTo") || null;
    const paymentMethod = url.searchParams.get("paymentMethod") || null;
    const query = url.searchParams.get("query") || null;
    const page = url.searchParams.get("page");
    const pageSize = url.searchParams.get("pageSize");

    const validation = validateOperationFilters({ status, movement, dateFrom, dateTo, paymentMethod });
    if (!validation.ok) return fail(validation.message, 400, { code: "INVALID_FILTERS" });

    const scopedParkings = await listParkings(authorization.db, authorization.scope);
    const [result, summary] = await Promise.all([
      searchOperationStays(authorization.db, scopedParkings, {
        status,
        movement,
        parkingId,
        companyId,
        dateFrom,
        dateTo,
        paymentMethod,
        query,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      }),
      getOperationsSummary(authorization.db, scopedParkings),
    ]);

    return NextResponse.json({
      data: {
        resumen: summary,
        rows: result.rows,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        parkings: result.parkings,
        companies: result.companies,
        actor: operationActor(authorization.context),
      },
    });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    return fail("No fue posible consultar la operación solicitada.", 503);
  }
}
