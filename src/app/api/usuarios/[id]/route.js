import { NextResponse } from "next/server";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requireCompanyResource, requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { listAuthorizedUsers } from "@/lib/usersRepository";
import { buildUserProfileUpdate } from "@/lib/userProfileUpdateCore.mjs";

function respuestaDetalle(result, id, context) {
  const user = result.data.find((item) => item.id === id) || null;
  const company = user ? result.companies.find((item) => item.id === user.empresaId) || null : null;
  const parkings = user ? result.parkings.filter((item) => (user.estacionamientos || []).includes(item.id)) : [];
  return NextResponse.json({
    data: {
      user,
      company,
      parkings,
      canManageCredentials: [ROLES.PLATFORM_ADMIN, ROLES.COMPANY_ADMIN].includes(context.role),
      canSetDirectPassword: context.role === ROLES.PLATFORM_ADMIN && context.portal === "root",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request, { params }) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try {
    requirePermission(authorization.context, PERMISSIONS.USERS_MANAGE);
  } catch (error) {
    return authorizationErrorResponse(request, error, authorization.context);
  }

  const { id } = await params;
  const db = getSupabaseAdminClient();
  const result = await listAuthorizedUsers(db, authorization.context);

  if (!result.data.some((item) => item.id === id)) {
    return NextResponse.json({ error: "No se encontró el usuario solicitado.", code: "USER_NOT_FOUND" }, { status: 404 });
  }

  return respuestaDetalle(result, id, authorization.context);
}

// Edita datos básicos (nombre, teléfono, estado) de un usuario
// company_admin/operator ya existente. Deliberadamente NO permite
// reasignar empresa ni estacionamientos, ni tocar contraseñas — eso se
// administra por los mecanismos ya existentes (/credencial,
// /recuperacion) y por la creación del usuario.
export async function PATCH(request, { params }) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try {
    requirePermission(authorization.context, PERMISSIONS.USERS_MANAGE);
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

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida.", code: "INVALID_JSON" }, { status: 400 });
  }

  const { errors, memberUpdate, phone, email } = buildUserProfileUpdate(payload);
  if (errors.length) {
    return NextResponse.json({ error: errors[0], details: errors, code: "VALIDATION_ERROR" }, { status: 400 });
  }
  if (!Object.keys(memberUpdate).length && phone === undefined && email === undefined) {
    return NextResponse.json({ error: "No hay cambios para guardar.", code: "NO_CHANGES" }, { status: 400 });
  }

  if (Object.keys(memberUpdate).length) {
    const updated = await db
      .from("company_members")
      .update({ ...memberUpdate, updated_at: new Date().toISOString() })
      .eq("user_id", id);
    if (updated.error) {
      console.error("[users:update:member]", updated.error);
      return NextResponse.json({ error: "No fue posible actualizar los datos del usuario.", code: "MEMBER_UPDATE_FAILED" }, { status: 500 });
    }
  }

  if (phone !== undefined || email !== undefined) {
    const { data: authData, error: authError } = await db.auth.admin.getUserById(id);
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "No se encontró el usuario solicitado.", code: "USER_NOT_FOUND" }, { status: 404 });
    }
    const authUpdate = {};
    if (phone !== undefined) {
      authUpdate.user_metadata = { ...(authData.user.user_metadata || {}), phone };
    }
    if (email !== undefined && email !== authData.user.email) {
      // email_confirm: true evita reenviar un correo de confirmación al
      // usuario — Root está fijando el correo directamente, igual que ya
      // ocurre con el establecimiento directo de clave.
      authUpdate.email = email;
      authUpdate.email_confirm = true;
    }
    if (Object.keys(authUpdate).length) {
      const updatedAuth = await db.auth.admin.updateUserById(id, authUpdate);
      if (updatedAuth.error) {
        const yaExiste = /already|exists|registrad/i.test(updatedAuth.error.message || "");
        return NextResponse.json({
          error: yaExiste ? "Ese correo electrónico ya está en uso por otro usuario." : "No fue posible actualizar los datos de acceso del usuario.",
          code: yaExiste ? "EMAIL_ALREADY_EXISTS" : "AUTH_UPDATE_FAILED",
        }, { status: yaExiste ? 409 : 500 });
      }
    }
  }

  const result = await listAuthorizedUsers(db, authorization.context);
  return respuestaDetalle(result, id, authorization.context);
}
