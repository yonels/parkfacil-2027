import { NextResponse } from "next/server";
import { checkExternalSqlConnection } from "@/lib/externalSqlServer";
import { authorizeRemainingRequest } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const authorization = await authorizeRemainingRequest(request, PERMISSIONS.PLATFORM_GLOBAL);
  if (authorization.response) return authorization.response;
  try {
    const startedAt = Date.now();
    const results = await Promise.all([checkExternalSqlConnection("master"), checkExternalSqlConnection("client")]);
    return NextResponse.json({ data: { status: "connected", databases: results.map((result) => ({ context: result.context, database: result.databaseName, productVersion: result.productVersion, serverTime: result.serverTime })), latencyMs: Date.now() - startedAt } });
  } catch (error) {
    console.error("[external-db:health]", { code: error?.code, name: error?.name });
    return NextResponse.json({ error: "No fue posible conectar con la base de datos externa.", code: "EXTERNAL_DB_UNAVAILABLE" }, { status: 503 });
  }
}
