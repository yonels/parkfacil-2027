import "server-only";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { authorizeReleasedPlatesRead, listCompanyParkings, listOffStreetCompanies } from "@/lib/releasedPlates/releasedPlateServer";
import { releasedPlateFromDb } from "@/lib/releasedPlates/releasedPlateCore.mjs";
import { fetchAllRows } from "./fetchAll.mjs";
import { formatLocalDateTime, localParts } from "@/lib/releasedPayment/zonedTime.mjs";
import { buildHistoryReport, buildOrganizationReport, buildPlateListReport, buildUsageReport } from "@/lib/reports/providers/releasedPlatesReports.mjs";
import { findReport, REPORT_STATUS } from "./registry.mjs";
import { resolvePeriod, REPORT_TIME_ZONE } from "./periodCore.mjs";
import { buildReportWorkbook, exportFileName } from "./workbookCore.mjs";

// Motor común de reportes (SOL-2026-10-28-005, E2): autorización, período,
// proveedor de datos y salida JSON o .xlsx. El acceso es por empresa: el
// administrador solo ve la suya; Root elige la empresa (solo lectura). Cada
// proveedor recibe únicamente datos de esa empresa.

function fail(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

const MAX_SOURCE_ROWS = 50000;

// Proveedores conectados a datos reales. Un reporte sin proveedor no se
// sirve aunque esté en el registro.
// Todas las autorizaciones de la empresa, por páginas (PostgREST corta en 1.000).
async function listCompanyAuthorizations(db, companyId) {
  const rows = await fetchAllRows(() => db.from("released_plate_authorizations").select("*")
    .eq("company_id", companyId).order("created_at", { ascending: false }).order("id"), { max: MAX_SOURCE_ROWS });
  return rows.map(releasedPlateFromDb);
}

const listing = (scope) => async ({ db, companyId, period, filters, now }) => {
  const authorizations = await listCompanyAuthorizations(db, companyId);
  return buildPlateListReport({ authorizations, period, filters, now, scope });
};

// Eventos inmutables de las autorizaciones de la empresa dentro del período.
async function loadCompanyEvents(db, companyId, period) {
  const data = await fetchAllRows(() => db.from("released_plate_authorization_events")
    .select("id,authorization_id,event_type,actor_email,created_at,new_values,parkings(name)")
    .eq("company_id", companyId).gte("created_at", period.fromIso).lt("created_at", period.toIso)
    .order("created_at", { ascending: false }).order("id"), { max: MAX_SOURCE_ROWS });
  return data.map((row) => ({
    authorizationId: row.authorization_id, type: row.event_type, at: row.created_at, actorEmail: row.actor_email,
    parkingName: row.parkings?.name || "", useNumber: row.event_type === "USED" ? Number(row.new_values?.uses_count || 0) : null,
    stayCode: row.event_type === "USED" ? row.new_values?.stay_code || null : null,
  }));
}

// Estadías con Pago liberado (modelo cliente) ingresadas en el período, solo
// en estacionamientos de la empresa.
async function loadReleasedStays(db, parkingIds, period) {
  if (!parkingIds.length) return [];
  return fetchAllRows(() => db.from("parking_stays")
    .select("id,code,parking_id,license_plate,status,entry_at,exit_at,total_amount,released_plate_authorization_id,released_covered_seconds,released_chargeable_seconds")
    .in("parking_id", parkingIds).not("released_plate_authorization_id", "is", null)
    .gte("entry_at", period.fromIso).lt("entry_at", period.toIso).order("entry_at", { ascending: false }).order("id"), { max: MAX_SOURCE_ROWS });
}

const PROVIDERS = {
  "pl-listado": listing("all"),
  "pl-gratuitas": listing("free"),
  "pl-terceros": listing("thirdParty"),
  "pl-vigentes": listing("current"),
  "pl-programadas": listing("scheduled"),
  "pl-vencimientos": listing("expiring"),
  "pl-vencidas": listing("expired"),
  "pl-finalizadas": listing("closed"),
  "pl-organizacion": async ({ db, companyId, period, now }) => buildOrganizationReport({ authorizations: await listCompanyAuthorizations(db, companyId), period, now }),
  "pl-historial": async ({ db, companyId, period, filters }) => {
    const [authorizations, events] = await Promise.all([listCompanyAuthorizations(db, companyId), loadCompanyEvents(db, companyId, period)]);
    return buildHistoryReport({ authorizations, events, filters });
  },
  "pl-uso": async ({ db, companyId, period, filters, parkings }) => {
    const ids = filters.parkingId ? [filters.parkingId] : parkings.map((p) => p.id);
    const [authorizations, stays] = await Promise.all([listCompanyAuthorizations(db, companyId), loadReleasedStays(db, ids, period)]);
    const plateQuery = String(filters.plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const filtered = plateQuery ? stays.filter((s) => s.license_plate.replace(/[^A-Z0-9]/g, "").includes(plateQuery)) : stays;
    return buildUsageReport({ stays: filtered, authorizations, parkingsById: new Map(parkings.map((p) => [p.id, p.name])) });
  },
};

export function hasProvider(reportId) {
  return Boolean(PROVIDERS[reportId]);
}

export async function handleReportRequest(request, reportId) {
  const report = findReport(reportId);
  if (!report) return fail("Reporte no encontrado.", 404);
  if (report.status !== REPORT_STATUS.AVAILABLE || !PROVIDERS[reportId]) return fail("Este reporte aún no está disponible.", 409, { code: "REPORT_NOT_AVAILABLE" });

  const auth = await authorizeReleasedPlatesRead(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const params = url.searchParams;
  const now = Date.now();
  const period = resolvePeriod(params.get("periodo") || "mes", { from: params.get("desde") || "", to: params.get("hasta") || "", now });
  if (!period.ok) return fail(period.error, 400, { code: "PERIOD_INVALID" });
  const filters = {
    plate: String(params.get("patente") || "").slice(0, 12),
    status: String(params.get("estado") || "").slice(0, 20),
    window: String(params.get("ventana") || "").slice(0, 3),
    parkingId: String(params.get("estacionamiento") || "").slice(0, 40),
  };

  try {
    const companies = auth.viewer === "ROOT" ? await listOffStreetCompanies(auth.db) : null;
    if (auth.viewer === "ROOT" && auth.companyId && !companies.some((c) => c.id === auth.companyId)) return fail("Empresa no encontrada.", 404);
    const companyId = auth.companyId || companies?.[0]?.id || null;
    if (!companyId) return fail("No hay empresas para consultar.", 404);
    const [{ data: company }, parkings] = await Promise.all([
      auth.db.from("companies").select("id,business_name,trade_name").eq("id", companyId).maybeSingle(),
      listCompanyParkings(auth.db, companyId),
    ]);
    if (filters.parkingId && !parkings.some((p) => p.id === filters.parkingId)) return fail("Estacionamiento no encontrado.", 404);
    const data = await PROVIDERS[reportId]({ db: auth.db, companyId, period, filters, now, parkings });
    const parkingNames = filters.parkingId ? parkings.filter((p) => p.id === filters.parkingId).map((p) => p.name) : parkings.map((p) => p.name);
    const result = {
      report: { id: report.id, label: report.label, categoryLabel: report.categoryLabel, productLabel: report.productLabel },
      title: `${report.productLabel} · ${report.label}`,
      meta: {
        companyId,
        companyName: company?.trade_name || company?.business_name || companyId,
        parkings: parkingNames,
        periodLabel: period.label,
        period,
        generatedAt: new Date(now).toISOString(),
        timeZone: REPORT_TIME_ZONE,
        filters: { Patente: filters.plate, Estado: filters.status, "Ventana (días)": report.filters.includes("window") ? filters.window || "7" : "" },
        viewer: auth.viewer,
      },
      companies,
      parkingOptions: parkings.map((p) => ({ id: p.id, name: p.name })),
      ...data,
    };

    if (params.get("formato") === "xlsx") {
      const buffer = await buildReportWorkbook(ExcelJS, result, {
        toLocalParts: (ms) => localParts(ms, REPORT_TIME_ZONE),
        formatGenerated: (iso) => `${formatLocalDateTime(iso, REPORT_TIME_ZONE)} (${REPORT_TIME_ZONE})`,
      });
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${exportFileName(report.id, period)}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error?.message === "EXPORT_TOO_LARGE") return fail(`El reporte supera ${error.limit} filas. Acota el período o los filtros.`, 413, { code: "EXPORT_TOO_LARGE" });
    console.error("[reportes:motor]", reportId, error?.code, error?.message);
    return fail("No fue posible generar el reporte.", 500);
  }
}
