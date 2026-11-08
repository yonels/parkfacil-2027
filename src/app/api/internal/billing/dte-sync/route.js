import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/onStreetCronAuth.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { syncHaulmerIssued } from "@/lib/billing/dteSyncService";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Sincronización diaria de documentos emitidos por Haulmer (SOL-2026-11-05-005, F2b, D10). Mismo esquema
// CRON_SECRET que los demás procesos internos. Si el proveedor no es Haulmer, no hace nada.
async function handle(request) {
  const authorization = authorizeCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET);
  if (!authorization.ok) return NextResponse.json({ error: authorization.status === 503 ? "Procesador no configurado." : "No autorizado." }, { status: authorization.status });
  try {
    const data = await syncHaulmerIssued(getSupabaseAdminClient(), {});
    return NextResponse.json({ data: { inserted: data.inserted, updated: data.updated, unchanged: data.unchanged, requests: data.requests, truncated: data.truncated, range: data.range } });
  } catch (error) {
    if (error?.code === "PROVIDER_NOT_HAULMER") return NextResponse.json({ data: { skipped: true, reason: error.message } });
    return NextResponse.json({ error: "No fue posible sincronizar con Haulmer.", code: error?.code || "DTE_SYNC_FAILED" }, { status: 503 });
  }
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
