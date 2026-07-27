import { NextResponse } from "next/server";
import { buildImportErrorsWorkbook, workbookToBuffer } from "@/lib/abonadosExcel";

export async function POST(request) {
  try {
    const body = await request.json();
    const workbook = await buildImportErrorsWorkbook(Array.isArray(body?.errors) ? body.errors : []);
    const buffer = await workbookToBuffer(workbook);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="errores_importacion_abonados.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "No fue posible generar el informe de errores." }, { status: 500 });
  }
}
