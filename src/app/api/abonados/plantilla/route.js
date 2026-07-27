import { NextResponse } from "next/server";
import { buildTemplateWorkbook, workbookToBuffer } from "@/lib/abonadosExcel";

export async function GET() {
  try {
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
