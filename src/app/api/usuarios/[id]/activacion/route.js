/******************************************************************
 * PARKFACIL 2027
 *---------------------------------------------------------------
 * MÓDULO    : USUARIOS / MODELO DE ACTIVACIÓN POR EMPRESA
 * ENDPOINT  : POST /api/usuarios/[id]/activacion
 *---------------------------------------------------------------
 * DESCRIPCIÓN:
 * Único punto de entrada para transicionar company_members.status
 * (activar indefinido, activar temporal, suspender, reactivar) --
 * exclusivo de Root (platform_admin), siempre auditado
 * (activated_at/by, suspended_at/by). Nunca alcanzable por
 * company_admin (§8.7 del encargo: "Cliente no puede activar
 * usuarios") ni por el propio usuario.
 ******************************************************************/

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePlatformAdmin } from "@/lib/auth/apiAuthorizationCore.mjs";
import { listAuthorizedUsers } from "@/lib/usersRepository";
import {
  ACTIVATION_ACTIONS,
  buildActivationUpdate,
  guardLastCompanyAdmin,
} from "@/lib/auth/memberActivationCore.mjs";
import { enviarCorreoMicrosoft } from "@/lib/mailService";
import {
  construirRedirectTo,
  escaparHtml,
  generarHtmlCorreo,
} from "@/lib/passwordRecoveryCore.mjs";

function obtenerHost(request) {
  return String(request.headers.get("x-forwarded-host") || request.headers.get("host") || "");
}

export async function POST(request, { params }) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;

  // Root-only, sin excepción -- ver actorCanActivate en
  // memberActivationCore.mjs (segunda barrera explícita más abajo).
  try {
    requirePlatformAdmin(authorization.context);
  } catch (error) {
    return authorizationErrorResponse(request, error, authorization.context);
  }

  const { id } = await params;
  const db = getSupabaseAdminClient();

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida.", code: "INVALID_JSON" }, { status: 400 });
  }

  const accion = String(payload?.accion || "");
  if (!Object.values(ACTIVATION_ACTIONS).includes(accion)) {
    return NextResponse.json({ error: "Acción de activación no reconocida.", code: "ACTION_INVALID" }, { status: 400 });
  }

  const { data: member, error: memberError } = await db
    .from("company_members")
    .select("user_id,company_id,role,status")
    .eq("user_id", id)
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json({ error: "No se encontró el usuario solicitado.", code: "USER_NOT_FOUND" }, { status: 404 });
  }

  // Regla §8.7: nadie puede activar su propio usuario, ni siquiera un
  // platform_admin que por algún motivo también tuviera una fila en
  // company_members (no debería ocurrir, pero se valida de todas formas).
  if (member.user_id === authorization.context.userId) {
    return NextResponse.json({ error: "No puedes modificar el acceso de tu propia cuenta.", code: "SELF_ACTIVATION_FORBIDDEN" }, { status: 403 });
  }

  const resultado = buildActivationUpdate({
    action: accion,
    hours: payload?.horas,
    customExpiresAt: payload?.expiraEn,
    actorUserId: authorization.context.userId,
    currentStatus: member.status,
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error, code: "ACTIVATION_INVALID" }, { status: 400 });
  }

  // Protección del último administrador (§ el encargo): suspender/
  // eliminar nunca puede dejar la empresa sin ningún company_admin
  // válido, ni siquiera para Root -- guardLastCompanyAdmin no distingue
  // actor, aplica igual. No hay excepción/override implementada todavía
  // (se propone antes de construirla, según lo pedido).
  if (accion === ACTIVATION_ACTIONS.SUSPEND || accion === ACTIVATION_ACTIONS.DEACTIVATE) {
    const { data: otherMembers, error: othersError } = await db
      .from("company_members")
      .select("user_id,role,status")
      .eq("company_id", member.company_id)
      .neq("user_id", id);
    if (othersError) {
      console.error("[users:activation:last-admin-check]", othersError);
      return NextResponse.json({ error: "No fue posible validar la protección de administración.", code: "LAST_ADMIN_CHECK_FAILED" }, { status: 500 });
    }
    const guard = guardLastCompanyAdmin({ targetMember: member, changes: resultado.update, otherMembers: otherMembers || [] });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error, code: guard.code }, { status: 409 });
    }
  }

  const updated = await db
    .from("company_members")
    .update({ ...resultado.update, updated_at: new Date().toISOString() })
    .eq("user_id", id);

  if (updated.error) {
    console.error("[users:activation:update]", updated.error);
    return NextResponse.json({ error: "No fue posible actualizar el acceso del usuario.", code: "ACTIVATION_UPDATE_FAILED" }, { status: 500 });
  }

  // FASE 9 del encargo: si Root activa (indefinido o temporal) y el
  // usuario aún no tiene una contraseña utilizable, se dispara el mismo
  // mecanismo seguro ya existente (generateLink + Microsoft Graph) para
  // que la defina por enlace -- nunca una contraseña visible para Root.
  // Estrictamente posterior y no transaccional (mismo patrón que el
  // correo de "contraseña actualizada" de passwordChangedNotification):
  // si el envío falla, la activación YA aplicada no se revierte ni se
  // muestra como fallida, solo se registra el error server-side.
  let enlaceEnviado = false;
  let enlaceError = null;
  const esActivacion = accion === ACTIVATION_ACTIONS.ACTIVATE_INDEFINITE || accion === ACTIVATION_ACTIONS.ACTIVATE_TEMPORARY;
  if (esActivacion && payload?.enviarEnlaceAcceso) {
    try {
      const { data: authData, error: authError } = await db.auth.admin.getUserById(id);
      if (authError || !authData?.user?.email) throw authError || new Error("Usuario sin correo de acceso.");

      const host = obtenerHost(request);
      const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
      const origin = local ? new URL(request.url).origin : null;
      const redirectTo = construirRedirectTo("cliente", { local, origin });

      const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
        type: "recovery",
        email: authData.user.email,
        options: { redirectTo },
      });
      if (linkError) throw linkError;
      const enlace = linkData?.properties?.action_link;
      if (!enlace) throw new Error("Supabase no generó el enlace de acceso.");

      await enviarCorreoMicrosoft({
        para: authData.user.email,
        asunto: "Tu acceso a ParkFacil fue activado",
        html: generarHtmlCorreo(escaparHtml(enlace)),
        texto: `Tu acceso a ParkFacil fue activado. Define tu contraseña aquí: ${enlace}`,
      });
      enlaceEnviado = true;
    } catch (error) {
      console.error("[users:activation:send-link]", error);
      enlaceError = "El acceso se activó, pero no fue posible enviar el enlace para definir la contraseña.";
    }
  }

  const result = await listAuthorizedUsers(db, authorization.context);
  const user = result.data.find((item) => item.id === id) || null;

  return NextResponse.json({
    data: user,
    enlaceEnviado,
    advertencia: enlaceError,
  }, { headers: { "Cache-Control": "no-store" } });
}
