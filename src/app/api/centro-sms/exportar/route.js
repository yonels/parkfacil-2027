import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsReadRequest, scopeSmsFilters, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { exportHistory } from "@/lib/sms/smsAdminRepository";
import { parseSmsFilters } from "@/lib/sms/smsHistoryCore.mjs";

export const dynamic = "force-dynamic";

// Exporta el historial filtrado a CSV o Excel (teléfono enmascarado; auditado).
export async function GET(request) {
  const authorization = await authorizeSmsReadRequest(request, PERMISSIONS.SMS_EXPORT);
  if (authorization.response) return authorization.response;
  try {
    const params = new URL(request.url).searchParams;
    const format = params.get("formato") === "csv" ? "csv" : "xlsx";
    const filters = scopeSmsFilters(parseSmsFilters(params), authorization.companyScope);
    const file = await exportHistory(filters, { format, includeContent: params.get("contenido") === "1" }, authorization.context);
    const name = `historial-sms-${filters.from}-a-${filters.to}.${file.extension}`;
    return new NextResponse(file.body, { headers: { "Content-Type": file.contentType, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store", "X-Export-Truncated": file.truncated ? "1" : "0" } });
  } catch (error) {
    return smsErrorResponse(error, "exportar", "No fue posible generar la exportación.");
  }
}
