import { NextResponse } from "next/server";
import { buildTemplateWorkbook, workbookToBuffer } from "@/lib/abonadosExcel";
import { authorizeSubscriberRequest } from "@/lib/auth/subscriberAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

export async function GET(request) {
  try {
    const authorization = await authorizeSubscriberRequest(request, PERMISSIONS.SUBSCRIBERS_MANAGE);
    if (authorization.response) return authorization.response;
    const workbook = await buildTemplateWorkbook();
    const buffer = await workbookToBuffer(workbook);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="plantilla_abonados.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "No fue posible generar la plantilla." }, { status: 500 });
  }
}
