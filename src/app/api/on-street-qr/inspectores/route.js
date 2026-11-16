import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { companyScope } from "@/lib/auth/apiAuthorizationCore.mjs";
import { listInspectorUsers } from "@/lib/onStreetAdminInspectionsRepository";

// Listado de Inspectores (§21 del brief). Mismo RBAC que el resto del
// módulo On Street. Desde SOL-2026-11-16-003 cada inspector pertenece a una
// empresa: company_admin ve solo los de su empresa; Root ve todos, con su
// empresa.
export async function GET(request) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  try {
    const inspectors = await listInspectorUsers(auth.db, { companyId: companyScope(auth.context) });
    return NextResponse.json({ data: inspectors });
  } catch (error) {
    console.error("[ON_STREET_ADMIN_INSPECTORES]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar los inspectores." }, { status: 503 });
  }
}

// Crear inspector: desde SOL-2026-11-16-003 se hace en el Catálogo de
// usuarios (POST /api/usuarios con role "inspector"), que crea también su
// membresía de empresa. Esta ruta ya no crea cuentas sin empresa.
export async function POST() {
  return NextResponse.json({
    error: "Los inspectores se crean en Usuarios › Inspectores, dentro de la empresa a la que pertenecen.",
    code: "INSPECTOR_CREATE_MOVED",
  }, { status: 410 });
}
