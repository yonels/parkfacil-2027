import { NextResponse } from "next/server";
import { buildAbonadosWorkbook, workbookToBuffer } from "@/lib/abonadosExcel";
import { fetchAllAbonadosForExport, parseAbonadosListParams } from "@/lib/abonadosRepository";
import { authorizeSubscriberRequest } from "@/lib/auth/subscriberAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

function timestamp() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = `${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
  return `${date}_${time}`;
}

export async function GET(request) {
  try {
    const authorization = await authorizeSubscriberRequest(request, PERMISSIONS.SUBSCRIBERS_READ);
    if (authorization.response) return authorization.response;
    const { db: supabase, scope } = authorization;
    const params = parseAbonadosListParams(new URL(request.url).searchParams);
    const abonados = await fetchAllAbonadosForExport(supabase, params, scope);
    const workbook = await buildAbonadosWorkbook(abonados);
    const buffer = await workbookToBuffer(workbook);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="abonados_${timestamp()}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "No fue posible exportar los abonados." }, { status: 500 });
  }
}
