import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { checkExternalSqlConnection } from "@/lib/externalSqlServer";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const actor = await authenticateRequest(request);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  if (!actor.isAdmin) return NextResponse.json({ error: "Esta comprobación requiere un administrador." }, { status: 403 });

  try {
    const startedAt = Date.now();
    const results = await Promise.all([
      checkExternalSqlConnection("master"),
      checkExternalSqlConnection("client"),
    ]);
    return NextResponse.json({
      data: {
        status: "connected",
        databases: results.map((result) => ({
          context: result.context,
          database: result.databaseName,
          productVersion: result.productVersion,
          serverTime: result.serverTime,
        })),
        latencyMs: Date.now() - startedAt,
      },
    });
  } catch (error) {
    console.error("[external-db:health]", { code: error?.code, name: error?.name });
    return NextResponse.json({
      error: "No fue posible conectar con la base de datos externa.",
      code: "EXTERNAL_DB_UNAVAILABLE",
    }, { status: 503 });
  }
}
