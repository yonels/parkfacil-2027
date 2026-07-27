import { NextResponse } from "next/server";
import { buildAbonadosWorkbook, workbookToBuffer } from "@/lib/abonadosExcel";
import { fetchAllAbonadosForExport, parseAbonadosListParams } from "@/lib/abonadosRepository";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

function timestamp() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = `${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
  return `${date}_${time}`;
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const params = parseAbonadosListParams(new URL(request.url).searchParams);
    const abonados = await fetchAllAbonadosForExport(supabase, params);
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
