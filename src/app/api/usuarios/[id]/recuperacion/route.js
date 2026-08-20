import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requireCompanyResource, requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import {
  AdminRecoverySendError,
  enviarRecuperacionAdministrativa,
} from "@/lib/adminPasswordRecoveryCore.mjs";
import { enviarCorreoMicrosoft } from "@/lib/mailService";

const MODO_DIAGNOSTICO = false;

function diagnostico(etiqueta, valor = "") {
  if (!MODO_DIAGNOSTICO) return;
  console.log(`[USUARIOS:RECUPERACION]`, etiqueta, valor);
}

// Dispara el mismo mecanismo real de recuperación (Supabase generateLink +
// Microsoft Graph) que /recuperar-contrasena, pero desde una acción
// administrativa ya autenticada y autorizada — no un sistema paralelo.
// Root o company_admin únicamente sobre usuarios operator/company_admin de
// su propia empresa (o de cualquier empresa, si es Root). Nunca se expone
// la contraseña, el token ni el enlace en la respuesta.
export async function POST(request, { params }) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try {
    requirePermission(authorization.context, PERMISSIONS.USER_CREDENTIALS_MANAGE);
  } catch (error) {
    return authorizationErrorResponse(request, error, authorization.context);
  }

  const { id } = await params;
  const db = getSupabaseAdminClient();

  const { data: member, error: memberError } = await db
    .from("company_members")
    .select("user_id,company_id,role,status")
    .eq("user_id", id)
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json({ error: "No se encontró el usuario solicitado.", code: "USER_NOT_FOUND" }, { status: 404 });
  }

  try {
    requireCompanyResource(authorization.context, member.company_id);
  } catch (error) {
    return authorizationErrorResponse(request, error, authorization.context);
  }

  if (!["company_admin", "operator"].includes(member.role)) {
    return NextResponse.json(
      { error: "La recuperación de contraseña está disponible para administradores de empresa y operadores.", code: "ROLE_NOT_SUPPORTED" },
      { status: 400 },
    );
  }

  const { data: authData, error: authError } = await db.auth.admin.getUserById(id);
  if (authError || !authData?.user?.email) {
    return NextResponse.json({ error: "No se encontró el usuario solicitado.", code: "USER_NOT_FOUND" }, { status: 404 });
  }

  try {
    await enviarRecuperacionAdministrativa({
      supabase: db,
      enviarCorreo: enviarCorreoMicrosoft,
      email: authData.user.email,
      portalDestino: "cliente",
      diagnosticar: diagnostico,
    });
  } catch (error) {
    console.error("[users:recuperacion]", {
      type: error?.name || "Error",
      code: error?.code || "RECOVERY_SEND_FAILED",
    });
    const status = error instanceof AdminRecoverySendError ? 502 : 500;
    return NextResponse.json(
      { error: "No fue posible enviar el correo de recuperación. Intenta nuevamente más tarde.", code: error?.code || "RECOVERY_SEND_FAILED" },
      { status },
    );
  }

  return NextResponse.json({ data: { ok: true, userId: id } }, { headers: { "Cache-Control": "no-store" } });
}
