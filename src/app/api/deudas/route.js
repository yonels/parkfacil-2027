import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationAuthorizationError } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { listParkings } from "@/lib/estacionamientosRepository";
import { canManageDebts, DEBT_STATUSES } from "@/lib/parkingDebtsCore.mjs";
import { finalizeClosedUnpaidStays, listDebts, listUnpaidStaysRequiringReview } from "@/lib/parkingDebtsRepository";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Deudas por vehículos que se retiraron sin pagar (SOL-2026-10-08-003).
// Solo administradores (empresa o Root), dentro de los estacionamientos de su
// alcance. Antes de listar se cierran las salidas sin pago cuyo turno ya cerró
// (recuperación ante una interrupción tras el cierre).
export async function GET(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.REPORTS_READ);
    if (authorization.response) return authorization.response;
    if (!canManageDebts(authorization.context.role)) {
      return NextResponse.json({ error: "Solo un administrador puede revisar las deudas.", code: "DEBTS_FORBIDDEN" }, { status: 403 });
    }
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (status && !Object.values(DEBT_STATUSES).includes(status)) {
      return NextResponse.json({ error: "Estado no válido.", code: "INVALID_FILTERS" }, { status: 400 });
    }
    if ((from && !ISO_DATE.test(from)) || (to && !ISO_DATE.test(to))) {
      return NextResponse.json({ error: "Fecha no válida.", code: "INVALID_FILTERS" }, { status: 400 });
    }
    const scopedParkings = await listParkings(authorization.db, authorization.scope);
    const parkingIds = scopedParkings.filter((parking) => parking.type === "OFF_STREET").map((parking) => parking.id);
    const requestedParkingId = url.searchParams.get("parkingId");
    if (requestedParkingId && !parkingIds.includes(requestedParkingId)) {
      return NextResponse.json({ error: "Estacionamiento fuera de tu alcance.", code: "PARKING_FORBIDDEN" }, { status: 403 });
    }
    await finalizeClosedUnpaidStays(authorization.db, { parkingIds });
    const [debts, requiresReview] = await Promise.all([
      listDebts(authorization.db, { parkingIds, status, plate: url.searchParams.get("plate"), parkingId: requestedParkingId, from, to }),
      listUnpaidStaysRequiringReview(authorization.db, { parkingIds }),
    ]);
    return NextResponse.json({
      data: debts,
      requiresReview,
      parkings: scopedParkings.filter((parking) => parking.type === "OFF_STREET").map((parking) => ({ id: parking.id, name: parking.name, code: parking.code })),
    });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    console.error("[deudas:GET]", { code: error?.code, message: error?.message });
    return NextResponse.json({ error: "No fue posible cargar las deudas." }, { status: 503 });
  }
}
