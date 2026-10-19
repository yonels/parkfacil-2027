import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingActor } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { COUPONS_DISABLED_ERROR, couponsEnabled } from "@/lib/cupones/couponsAvailability.mjs";
import { summarizeCompanyCoupons } from "@/lib/cupones/couponReportsService";
import { isValidIsoDate } from "@/lib/pos/activityReportCore.mjs";

// Resumen de cupones por tienda o campaña (SOL-2026-10-19-002, etapa B):
// emitidos, entregados, canjeados, vencidos sin usar, % de canje y monto
// descontado del período. El administrador ve solo su empresa; Root, todas.
export async function GET(request) {
  if (!couponsEnabled()) return NextResponse.json(COUPONS_DISABLED_ERROR, { status: 403 });
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.COUPONS_READ); if (auth.response) return auth.response;
  const actor = remainingActor(auth.context);
  const url = new URL(request.url);
  const dateFrom = url.searchParams.get("dateFrom") || null;
  const dateTo = url.searchParams.get("dateTo") || null;
  const groupBy = url.searchParams.get("groupBy") === "campaign" ? "campaign" : "merchant";
  if ((dateFrom && !isValidIsoDate(dateFrom)) || (dateTo && !isValidIsoDate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) {
    return NextResponse.json({ error: "Rango de fechas inválido." }, { status: 400 });
  }
  if (!actor.isPlatformAdmin && !actor.companyId) return NextResponse.json({ error: "No tienes acceso a los cupones." }, { status: 403 });
  try {
    const rows = await summarizeCompanyCoupons(auth.db, { companyId: actor.isPlatformAdmin ? null : actor.companyId, dateFrom, dateTo, groupBy });
    return NextResponse.json({ data: { rows, groupBy, dateFrom, dateTo } });
  } catch {
    return NextResponse.json({ error: "No fue posible calcular el resumen de cupones." }, { status: 503 });
  }
}
