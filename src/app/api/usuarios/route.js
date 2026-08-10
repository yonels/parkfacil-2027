import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { companyScope, requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";
import { listAuthorizedUsers } from "@/lib/usersRepository";

export const dynamic = "force-dynamic";

const CREATE_ALLOWED_ROLES = new Set([ROLES.COMPANY_ADMIN, ROLES.OPERATOR]);

function createTemporaryPassword() {
  return `Pf!${randomBytes(9).toString("base64url")}9a`;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCreatePayload(input) {
  return {
    fullName: String(input?.fullName || "").trim(),
    email: normalizeEmail(input?.email),
    phone: String(input?.phone || "").trim(),
    role: String(input?.role || "").trim(),
    companyId: String(input?.companyId || "").trim(),
    parkingIds: Array.isArray(input?.parkingIds) ? input.parkingIds.filter(Boolean).map((id) => String(id)) : [],
  };
}

export async function GET(request) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try { requirePermission(authorization.context, PERMISSIONS.USERS_MANAGE); } catch (error) { return authorizationErrorResponse(request, error, authorization.context); }

  const db = getSupabaseAdminClient();
  try {
    const result = await listAuthorizedUsers(db, authorization.context);
    return NextResponse.json({
      ...result,
      canManageCredentials: [ROLES.PLATFORM_ADMIN, ROLES.COMPANY_ADMIN].includes(authorization.context.role),
      canSetDirectPassword: authorization.context.role === ROLES.PLATFORM_ADMIN && authorization.context.portal === "root",
      persistent: true,
    });
  } catch (error) {
    console.error("[users:list]", error);
    return NextResponse.json({ error: "No fue posible obtener los usuarios.", code: "USERS_READ_FAILED" }, { status: 500 });
  }
}

export async function POST(request) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try { requirePermission(authorization.context, PERMISSIONS.USERS_MANAGE); } catch (error) { return authorizationErrorResponse(request, error, authorization.context); }

  const db = getSupabaseAdminClient();
  let createdUserId = null;
  let payload;
  try {
    payload = normalizeCreatePayload(await request.json());
  } catch {
    return NextResponse.json({ error: "Solicitud invalida.", code: "INVALID_JSON" }, { status: 400 });
  }

  const errors = {};
  if (!payload.fullName) errors.fullName = "El nombre es obligatorio.";
  if (!payload.email) errors.email = "El correo es obligatorio.";
  if (!payload.email.includes("@")) errors.email = "Correo invalido.";
  if (!CREATE_ALLOWED_ROLES.has(payload.role)) errors.role = "Selecciona un perfil valido para crear el usuario.";
  if (Object.keys(errors).length) return NextResponse.json({ error: "Datos incompletos para crear el usuario.", details: errors, code: "VALIDATION_ERROR" }, { status: 400 });

  const scope = companyScope(authorization.context);
  const targetCompanyId = scope || payload.companyId;
  if (!targetCompanyId) {
    return NextResponse.json({ error: "Selecciona una empresa para crear el usuario.", code: "COMPANY_REQUIRED" }, { status: 400 });
  }

  try {
    const company = await db.from("companies").select("id").eq("id", targetCompanyId).maybeSingle();
    if (company.error) throw company.error;
    if (!company.data) {
      return NextResponse.json({ error: "No se encontro la empresa solicitada.", code: "COMPANY_NOT_FOUND" }, { status: 404 });
    }

    const parkingIds = payload.parkingIds.length ? payload.parkingIds : [];
    if (parkingIds.length) {
      const parkings = await db.from("parkings").select("id").eq("company_id", targetCompanyId).in("id", parkingIds);
      if (parkings.error) throw parkings.error;
      const validIds = new Set((parkings.data || []).map((item) => item.id));
      const invalid = parkingIds.filter((id) => !validIds.has(id));
      if (invalid.length) {
        return NextResponse.json({ error: "Algunos estacionamientos no pertenecen a la empresa seleccionada.", code: "PARKING_SCOPE_INVALID" }, { status: 400 });
      }
    }

    const temporaryPassword = createTemporaryPassword();
    const created = await db.auth.admin.createUser({
      email: payload.email,
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: {
        role: payload.role,
        company_id: targetCompanyId,
        access_scope: payload.role === ROLES.OPERATOR ? "pos_only" : "company",
      },
      user_metadata: {
        full_name: payload.fullName,
        phone: payload.phone || null,
        must_change_password: true,
      },
    });

    if (created.error) {
      const message = created.error.message || "No fue posible crear el usuario.";
      if (/already|exists|registered/i.test(message)) {
        return NextResponse.json({ error: "El correo ya esta registrado.", code: "EMAIL_ALREADY_EXISTS" }, { status: 409 });
      }
      throw created.error;
    }

    createdUserId = created.data.user.id;
    const member = await db.from("company_members").insert({
      user_id: createdUserId,
      company_id: targetCompanyId,
      full_name: payload.fullName,
      role: payload.role,
      status: "active",
      pos_only: payload.role === ROLES.OPERATOR,
      must_change_password: true,
    });
    if (member.error) throw member.error;

    if (parkingIds.length) {
      const rows = parkingIds.map((parkingId) => ({
        user_id: createdUserId,
        parking_id: parkingId,
        access_level: payload.role === ROLES.OPERATOR ? "POS_OPERATOR" : "ADMIN",
      }));
      const access = await db.from("company_member_parkings").insert(rows);
      if (access.error) throw access.error;
    }

    const result = await listAuthorizedUsers(db, authorization.context);
    const createdUser = result.data.find((item) => item.id === createdUserId) || null;

    return NextResponse.json({
      data: createdUser,
      credential: {
        userId: createdUserId,
        username: payload.email,
        temporaryPassword,
        mustChangePassword: true,
      },
    }, { status: 201 });
  } catch (error) {
    if (createdUserId) await db.auth.admin.deleteUser(createdUserId);
    console.error("[users:create]", error);
    return NextResponse.json({ error: "No fue posible crear el usuario.", code: "USER_CREATE_FAILED" }, { status: 500 });
  }
}
