import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { summarizeFolios } from "@/lib/billing/foliosCore.mjs";
import { readSettingsRow } from "@/lib/billing/settingsRepository";
import { providerFor } from "@/lib/billing/providers/providerResolver";

// Folios disponibles por tipo de DTE según Haulmer (SOL-2026-11-05-005, 2026-11-09). En modo simulado no hay folios.
export async function GET(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_READ);
  if (auth.response) return auth.response;
  try {
    const settings = await readSettingsRow(auth.db);
    if (settings.invoice_provider !== "HAULMER") return NextResponse.json({ data: { provider: "SIMULATED", environment: null, rows: [], worst: "ok", alerts: [] } });
    const environment = settings.provider_environment === "PRODUCTION" ? "PRODUCTION" : "TEST";
    const provider = await providerFor(auth.db, "haulmer");
    const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const summary = summarizeFolios(await provider.getAvailableFolios(), today);
    return NextResponse.json({ data: { provider: "HAULMER", environment, checkedAt: new Date().toISOString(), ...summary } });
  } catch (error) {
    return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: error.message || "No fue posible consultar los folios en Haulmer.", code: error.code || "FOLIOS_READ_FAILED" }, { status: 502 });
  }
}
