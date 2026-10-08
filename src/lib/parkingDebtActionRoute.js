import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationActor, operationAuthorizationError } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { listParkings } from "@/lib/estacionamientosRepository";
import { canManageDebts, DebtInputError, resolveDebtChannel } from "@/lib/parkingDebtsCore.mjs";
import { getDebt } from "@/lib/parkingDebtsRepository";

// Acción de administrador sobre una deuda (marcar pagada / condonar, D9).
// Verifica rol, alcance (la deuda debe ser de un estacionamiento visible para
// el actor) y que siga pendiente; la base vuelve a exigir la transición.
export async function handleDebtAction(request, params, { validate, apply }) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.REPORTS_READ);
    if (authorization.response) return authorization.response;
    if (!canManageDebts(authorization.context.role)) {
      return NextResponse.json({ error: "Solo un administrador puede gestionar deudas.", code: "DEBTS_FORBIDDEN" }, { status: 403 });
    }
    const { debtId } = await params;
    const debt = await getDebt(authorization.db, debtId);
    const scopedParkings = await listParkings(authorization.db, authorization.scope);
    if (!debt || !scopedParkings.some((parking) => parking.id === debt.parkingId)) {
      return NextResponse.json({ error: "La deuda no existe.", code: "DEBT_NOT_FOUND" }, { status: 404 });
    }
    if (debt.status !== "PENDING") {
      return NextResponse.json({ error: "La deuda ya no está pendiente.", code: "DEBT_NOT_PENDING" }, { status: 409 });
    }
    const input = validate(await request.json().catch(() => ({})));
    const actor = operationActor(authorization.context);
    const channel = resolveDebtChannel(String(request.headers.get("x-parkfacil-portal") || "").toLowerCase() === "terminal");
    const updated = await apply(authorization.db, { debtId: debt.id, actor, channel, ...input });
    if (!updated) return NextResponse.json({ error: "La deuda cambió mientras se procesaba. Actualiza la lista.", code: "DEBT_NOT_PENDING" }, { status: 409 });
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof DebtInputError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    console.error("[deudas:action]", { code: error?.code, message: error?.message });
    return NextResponse.json({ error: "No fue posible actualizar la deuda." }, { status: 503 });
  }
}
