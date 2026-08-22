import { NextResponse } from "next/server";
import { processOnStreetSmsDeliveryStatus } from "@/lib/onStreetSmsService";
// Consulta el DLR (delivery report) de los avisos ya enviados que aún no
// tienen confirmación de entrega. Mismo patrón de autorización que
// /process (CRON_SECRET) — pensado para correr periódicamente, separado
// del envío, ya que "enviado" y "entregado" son eventos distintos en el
// tiempo (ver onStreetSmsService.processOnStreetSmsDeliveryStatus).
export async function POST(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Procesador no configurado." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  try { const checked = await processOnStreetSmsDeliveryStatus(); return NextResponse.json({ data: { checked: checked.length } }); }
  catch { return NextResponse.json({ error: "No fue posible consultar el estado de entrega." }, { status: 503 }); }
}
