import { NextResponse } from "next/server";
import { parseImportWorkbook } from "@/lib/abonadosExcel";
import { fetchAllAbonadosForExport } from "@/lib/abonadosRepository";
import { authorizeSubscriberRequest } from "@/lib/auth/subscriberAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request) {
  try {
    const authorization = await authorizeSubscriberRequest(request, PERMISSIONS.SUBSCRIBERS_MANAGE);
    if (authorization.response) return authorization.response;
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") return jsonError("Debe seleccionar un archivo Excel.");
    if (!file.name.toLowerCase().endsWith(".xlsx")) return jsonError("Solo se permiten archivos .xlsx.");
    if (file.size > MAX_FILE_SIZE) return jsonError("El archivo supera el tamano maximo permitido.");

    const current = await fetchAllAbonadosForExport(authorization.db, { page: 1, limit: 100, sort: "codigo", direction: "asc" }, authorization.scope);
    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await parseImportWorkbook(buffer, current);
    return NextResponse.json({ fileName: file.name, ...preview });
  } catch {
    return jsonError("No fue posible validar el archivo Excel.", 500);
  }
}
