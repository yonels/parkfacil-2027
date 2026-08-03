import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

function createTemporaryPassword() {
  return `Pf!${randomBytes(9).toString("base64url")}9a`;
}

export async function POST(request, { params }) {
  const actor = await authenticateRequest(request);
  if (!actor) {
    return NextResponse.json({ error: "Debes iniciar sesión.", code: "AUTH_REQUIRED" }, { status: 401 });
  }
  if (!actor.isPlatformAdmin) {
    return NextResponse.json(
      { error: "Solo ParkFacil Root puede administrar credenciales.", code: "CREDENTIAL_FORBIDDEN" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const db = getSupabaseAdminClient();
  const [{ data: member, error: memberError }, { data: authData, error: authError }] = await Promise.all([
    db.from("company_members").select("user_id,role,status").eq("user_id", id).single(),
    db.auth.admin.getUserById(id),
  ]);

  if (memberError || authError || !member || !authData?.user) {
    return NextResponse.json({ error: "No se encontró el usuario solicitado.", code: "USER_NOT_FOUND" }, { status: 404 });
  }
  if (!["company_admin", "operator"].includes(member.role)) {
    return NextResponse.json(
      { error: "La generación de claves está disponible para administradores de empresa y operadores.", code: "ROLE_NOT_SUPPORTED" },
      { status: 400 },
    );
  }

  const temporaryPassword = createTemporaryPassword();
  const updatedAuth = await db.auth.admin.updateUserById(id, {
    password: temporaryPassword,
    user_metadata: {
      ...(authData.user.user_metadata || {}),
      must_change_password: true,
    },
  });
  if (updatedAuth.error) {
    console.error("[users:credential:update-auth]", updatedAuth.error);
    return NextResponse.json({ error: "No fue posible generar la clave temporal.", code: "CREDENTIAL_UPDATE_FAILED" }, { status: 500 });
  }

  const updatedMember = await db
    .from("company_members")
    .update({ must_change_password: true, updated_at: new Date().toISOString() })
    .eq("user_id", id);
  if (updatedMember.error) {
    console.error("[users:credential:update-member]", updatedMember.error);
  }

  return NextResponse.json({
    data: {
      userId: id,
      username: authData.user.email,
      temporaryPassword,
      mustChangePassword: true,
      warning: updatedMember.error ? "La clave cambió, pero su indicador de seguridad requiere revisión." : null,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
