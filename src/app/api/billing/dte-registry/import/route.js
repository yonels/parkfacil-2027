import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { DteImportError, parseIssuedDocumentsFile } from "@/lib/billing/dteRegistryCore.mjs";
import { readSpreadsheet } from "@/lib/billing/dteFileReader";
import { applyDteImport, recordFailedImport } from "@/lib/billing/dteRegistryRepository";

// Importa la planilla de EasyDoc o el CSV de ventas del Registro de Compras y Ventas del SII.
// commit=false devuelve la vista previa sin guardar; commit=true guarda. SOL-2026-11-05-005, F2b.
export const maxDuration = 120;

export async function POST(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_MANAGE);
  if (auth.response) return auth.response;
  let fileName = null;
  const commit = new URL(request.url).searchParams.get("commit") === "true";
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") throw new DteImportError("DTE_FILE_REQUIRED", "Seleccione el archivo a importar.");
    fileName = String(file.name || "").slice(0, 200);
    const rows = await readSpreadsheet(Buffer.from(await file.arrayBuffer()), fileName);
    const parsed = parseIssuedDocumentsFile(rows, { fileName });
    const data = await applyDteImport(auth.db, { source: parsed.format, ...parsed, fileName, actorId: auth.context.userId, commit });
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof DteImportError) {
      if (commit) await recordFailedImport(auth.db, { source: /\.csv$/i.test(fileName || "") ? "SII_RCV" : "EASYDOC", fileName, message: error.message, actorId: auth.context.userId }).catch(() => {});
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: "No fue posible importar la planilla.", code: error.code || "DTE_IMPORT_FAILED" }, { status: 500 });
  }
}
