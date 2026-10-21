import { NextResponse } from "next/server";
import { authorizeParkingRequest } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { addCompanyHoliday, HolidayInputError, listCompanyHolidays } from "@/lib/parkingHolidaysRepository";

// Feriados propios del cliente (SOL-2026-10-08-003, D14). Se administran desde
// las tarifas de un estacionamiento, pero pertenecen a la empresa: aplican a
// todos sus estacionamientos con tarifas por franja.
function fail(message, status = 400, details) { return NextResponse.json({ error: message, details }, { status }); }

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_READ); if (auth.response) return auth.response;
    return NextResponse.json({ data: await listCompanyHolidays(auth.db, auth.parking.companyId) });
  } catch (error) {
    console.error("[parking:feriados:get]", { code: error?.code, message: error?.message });
    return fail("No fue posible cargar los feriados.", 503);
  }
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response;
    const input = await request.json().catch(() => ({}));
    const holiday = await addCompanyHoliday(auth.db, {
      companyId: auth.parking.companyId, date: input.date, label: input.label, createdBy: auth.context.userId,
    });
    return NextResponse.json({ data: holiday }, { status: 201 });
  } catch (error) {
    if (error instanceof HolidayInputError) return fail(error.message, error.code === "HOLIDAY_DUPLICATED" ? 409 : 400, { code: error.code });
    console.error("[parking:feriados:post]", { code: error?.code, message: error?.message });
    return fail("No fue posible guardar el feriado.", 503);
  }
}
