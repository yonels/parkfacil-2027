import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationAuthorizationError } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { listParkings } from "@/lib/estacionamientosRepository";
import { getDashboardCapacity } from "@/lib/offStreetDashboardCapacity";
import { resolveQueryParkingIds } from "@/lib/offStreetRevenueService";
import { FLOW_PERIODS, monthRange } from "@/lib/generalDashboardCore.mjs";
import { getGeneralDashboardFlow, getGeneralDashboardHourly, getGeneralDashboardIncome, getGeneralDashboardOverview } from "@/lib/generalDashboardService";
import { isValidIsoDate } from "@/lib/pos/activityReportCore.mjs";

export const dynamic = "force-dynamic";

const fail = (message, status = 400) => NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
const done = (data) => NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });

// Mismo permiso y aislamiento por empresa que /api/reportes/actividad: Root ve todo y cada
// administrador solo los estacionamientos de su empresa (authorization.scope).
export async function GET(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.REPORTS_READ);
    if (authorization.response) return authorization.response;
    const url = new URL(request.url);
    const section = url.searchParams.get("section") || "overview";
    const { db } = authorization;
    const offStreet = (await listParkings(db, authorization.scope)).filter((parking) => parking.type === "OFF_STREET");
    // Filtro opcional por empresa y estacionamiento, siempre dentro de lo que el usuario puede ver.
    const { candidateParkings, queryParkingIds } = resolveQueryParkingIds(offStreet, {
      companyId: url.searchParams.get("companyId") || null,
      parkingId: url.searchParams.get("parkingId") || null,
    });
    const parkings = candidateParkings.filter((parking) => queryParkingIds.includes(parking.id));

    if (section === "flow") {
      const period = url.searchParams.get("period") || "7 días";
      if (!FLOW_PERIODS.includes(period)) return fail("Período no válido.");
      return done(await getGeneralDashboardFlow(db, parkings, { period }));
    }
    if (section === "hourly") {
      const date = url.searchParams.get("date");
      if (!isValidIsoDate(date)) return fail("La fecha debe tener formato AAAA-MM-DD.");
      return done(await getGeneralDashboardHourly(db, parkings, { date }));
    }
    if (section === "income") {
      const month = url.searchParams.get("month");
      const date = url.searchParams.get("date");
      if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        const range = monthRange(month);
        return done(await getGeneralDashboardIncome(db, parkings, { dateFrom: range.from, dateTo: range.to }));
      }
      if (isValidIsoDate(date)) return done(await getGeneralDashboardIncome(db, parkings, { dateFrom: date, dateTo: date }));
      return fail("Indica un mes o un día válidos.");
    }
    if (section !== "overview") return fail("Sección no válida.");
    // Solo estacionamientos operando: los borradores no tienen vehículos y bajarían el porcentaje.
    const capacity = await getDashboardCapacity(db, parkings.filter((parking) => parking.status === "ACTIVE"));
    const companies = [...new Map(offStreet.map((parking) => [parking.companyId, { id: parking.companyId, name: parking.companyName || "Empresa" }])).values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
    const options = { companies, parkings: offStreet.map((parking) => ({ id: parking.id, code: parking.code, name: parking.name, companyId: parking.companyId, active: parking.status === "ACTIVE" })) };
    return done({ ...(await getGeneralDashboardOverview(db, parkings, { capacity })), options });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    console.error("[dashboard-general]", error?.code || error?.message);
    return fail("No fue posible obtener los indicadores.", 503);
  }
}
