import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { BILLING_PROVIDERS, BillingSettingsError, PROVIDER_ENVIRONMENTS, validateBillingSettings } from "@/lib/billing/settingsCore.mjs";
import { getBillingSettings, saveBillingSettings } from "@/lib/billing/settingsRepository";
import { haulmerApiKey } from "@/lib/billing/providers/providerResolver";

// Configuración de facturación de ParkFacil (SOL-2026-11-05-005, F1.4). Solo Root tiene permisos de facturación.
export async function GET(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_READ);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ data: await getBillingSettings(auth.db), providers: BILLING_PROVIDERS, environments: PROVIDER_ENVIRONMENTS, keys: { TEST: Boolean(haulmerApiKey("TEST")), PRODUCTION: Boolean(haulmerApiKey("PRODUCTION")) } });
  } catch (error) {
    return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: "No fue posible leer la configuración.", code: error.code || "SETTINGS_READ_FAILED" }, { status: 500 });
  }
}

export async function PUT(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_MANAGE);
  if (auth.response) return auth.response;
  try {
    const row = validateBillingSettings(await request.json());
    // F2: no se puede activar Haulmer si el servidor no tiene su API Key (variables de entorno, nunca en la base).
    if (row.invoice_provider === "HAULMER" && !haulmerApiKey(row.provider_environment)) {
      const variable = row.provider_environment === "PRODUCTION" ? "OPENFACTURA_API_KEY" : "OPENFACTURA_TEST_API_KEY";
      return NextResponse.json({ error: `El servidor no tiene configurada la API Key de Haulmer (${variable}).`, code: "SETTINGS_PROVIDER_KEY_MISSING", field: "invoiceProvider" }, { status: 422 });
    }
    return NextResponse.json({ data: await saveBillingSettings(auth.db, row, auth.context.userId) });
  } catch (error) {
    if (error instanceof BillingSettingsError) return NextResponse.json({ error: error.message, code: error.code, field: error.field }, { status: error.status });
    return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: "No fue posible guardar la configuración.", code: error.code || "SETTINGS_SAVE_FAILED" }, { status: 500 });
  }
}
