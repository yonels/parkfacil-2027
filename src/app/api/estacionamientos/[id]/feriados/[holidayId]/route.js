import { NextResponse } from "next/server";
import { authorizeParkingRequest } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { removeCompanyHoliday } from "@/lib/parkingHolidaysRepository";

// Quita un feriado del cliente. Afecta los cobros futuros; las estadías ya
// cobradas conservan su desglose (charge_breakdown) y no se recalculan.
export async function DELETE(request, { params }) {
  try {
    const { id, holidayId } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response;
    const removed = await removeCompanyHoliday(auth.db, { companyId: auth.parking.companyId, holidayId });
    if (!removed) return NextResponse.json({ error: "El feriado no existe." }, { status: 404 });
    return NextResponse.json({ data: { removed: true } });
  } catch (error) {
    console.error("[parking:feriados:delete]", { code: error?.code, message: error?.message });
    return NextResponse.json({ error: "No fue posible quitar el feriado." }, { status: 503 });
  }
}
