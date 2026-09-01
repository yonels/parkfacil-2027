import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { requirePlatformAdmin } from "@/lib/auth/apiAuthorizationCore.mjs";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { listInspectorUsers } from "@/lib/onStreetAdminInspectionsRepository";

// Listado de Inspectores (§21 del brief). Mismo RBAC que el resto del
// módulo On Street -- lectura disponible para platform_admin/company_admin
// (ambos quieren saber quién fiscalizó), la activación/desactivación queda
// exclusiva de platform_admin (ver [id]/estado/route.js): Inspector no está
// ligado a ninguna empresa (§3.1/§22 de Inspectores Etapa 2), así que
// administrar la cuenta en sí es un recurso global, no de una empresa
// puntual.
export async function GET(request) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  try {
    const inspectors = await listInspectorUsers(auth.db);
    return NextResponse.json({ data: inspectors });
  } catch (error) {
    console.error("[ON_STREET_ADMIN_INSPECTORES]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar los inspectores." }, { status: 503 });
  }
}

// Crear Inspector (§21): exclusivo de platform_admin -- mismo mecanismo que
// el bootstrap de Root (rootBootstrapCore.mjs), app_metadata.role="inspector",
// contraseña temporal de un solo uso (must_change_password), sin tabla
// paralela ni segundo sistema de autenticación.
export async function POST(request) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  try {
    requirePlatformAdmin(auth.context);
  } catch (error) {
    if (error instanceof AuthorizationError) return authorizationErrorResponse(request, error, auth.context);
    throw error;
  }
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 }); }
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Correo no válido." }, { status: 400 });
  const temporaryPassword = randomBytes(9).toString("base64url");
  try {
    const created = await auth.db.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: { role: "inspector" },
      user_metadata: { full_name: String(body.fullName || "").trim() || null, must_change_password: true },
    });
    if (created.error) throw created.error;
    return NextResponse.json({ data: { id: created.data.user.id, email, temporaryPassword } }, { status: 201 });
  } catch (error) {
    if (String(error.message || "").includes("already been registered")) return NextResponse.json({ error: "Ya existe un usuario con ese correo." }, { status: 409 });
    console.error("[ON_STREET_ADMIN_INSPECTOR_CREATE]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible crear el inspector." }, { status: 503 });
  }
}
