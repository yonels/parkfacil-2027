import { NextResponse } from "next/server";
import { authorizeDteRequest, dteFailure, fail, loadCompanyDteSettings, loadRootDteStatus, saveCompanyDteSettings } from "@/lib/boletaElectronica/dteSettingsServer";

// Boleta electrónica (SOL-2026-10-20-001).
// GET: administrador → configuración de su empresa (API Key enmascarada);
//      Root → estado por empresa (sin API Key). `companyId` filtra para Root.
// PUT: solo el administrador de la empresa (Root solo ve el estado).

export const dynamic = "force-dynamic";

export async function GET(request) {
  let auth;
  try {
    auth = await authorizeDteRequest(request);
    if (auth.response) return auth.response;
    if (auth.isRoot) {
      const companyId = new URL(request.url).searchParams.get("companyId") || null;
      return NextResponse.json({ data: { mode: "ROOT", companies: await loadRootDteStatus(auth.authorization.db, { companyId }) } });
    }
    return NextResponse.json({ data: { mode: "COMPANY", settings: await loadCompanyDteSettings(auth.authorization) } });
  } catch (error) {
    return dteFailure(request, auth?.authorization?.context, error, "No fue posible cargar la boleta electrónica.");
  }
}

export async function PUT(request) {
  let auth;
  try {
    auth = await authorizeDteRequest(request);
    if (auth.response) return auth.response;
    if (auth.isRoot) return fail("La API Key la ingresa el administrador de la empresa. Root solo ve el estado.", 403, { code: "DTE_ROOT_READ_ONLY" });
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ data: { mode: "COMPANY", settings: await saveCompanyDteSettings(auth.authorization, body) } });
  } catch (error) {
    return dteFailure(request, auth?.authorization?.context, error, "No fue posible guardar la boleta electrónica.");
  }
}
