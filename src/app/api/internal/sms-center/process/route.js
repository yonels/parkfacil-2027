import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/onStreetCronAuth.mjs";
import { checkCentralSmsDeliveries, processDueCentralSms } from "@/lib/sms/smsCenterService";

export const dynamic = "force-dynamic";

// Procesador del registro central SMS (SOL-2026-10-29-007): reintentos
// vencidos + consulta DLR. Mismo esquema CRON_SECRET que
// /api/internal/on-street-sms/*. NO está programado en vercel.json: activar
// un cron requiere autorización (ver manual de la solicitud).
async function handle(request) {
  const authorization = authorizeCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET);
  if (!authorization.ok) return NextResponse.json({ error: authorization.status === 503 ? "Procesador no configurado." : "No autorizado." }, { status: authorization.status });
  try {
    const processed = await processDueCentralSms({ limit: 50 });
    const checked = await checkCentralSmsDeliveries({ limit: 50 });
    return NextResponse.json({ data: { processed: processed.length, checked: checked.length } });
  } catch {
    return NextResponse.json({ error: "No fue posible procesar el registro central SMS." }, { status: 503 });
  }
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
