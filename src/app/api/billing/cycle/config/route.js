import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getCycleConfig, saveCycleConfig } from "@/lib/billing/billingCycleService";

// Configuración de las etapas del ciclo (obligatoria / opcional / omitida, a mano / automática, responsable).
export async function GET(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_READ);
  if (auth.response) return auth.response;
  try { return NextResponse.json({ data: (await getCycleConfig(auth.db)).config }); }
  catch (error) { return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: "No fue posible leer la configuración del ciclo.", code: error.code || "CYCLE_CONFIG_READ_FAILED" }, { status: 500 }); }
}

export async function PUT(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_MANAGE);
  if (auth.response) return auth.response;
  try { return NextResponse.json({ data: await saveCycleConfig(auth.db, await request.json(), auth.context.userId) }); }
  catch (error) { return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: "No fue posible guardar la configuración del ciclo.", code: error.code || "CYCLE_CONFIG_SAVE_FAILED" }, { status: 500 }); }
}
