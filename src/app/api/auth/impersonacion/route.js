/******************************************************************
 * PARKFACIL 2027
 *---------------------------------------------------------------
 * MÓDULO    : AUTENTICACIÓN / IMPERSONACIÓN ROOT -> CLIENTE
 * ENDPOINT  : /api/auth/impersonacion
 *---------------------------------------------------------------
 * DESCRIPCIÓN:
 * Establece/consulta/termina una sesión de impersonación "Entrar
 * como cliente". No es un segundo sistema de autenticación: usa
 * EXACTAMENTE el mismo token real de Supabase que ya emite
 * signInWithPassword (ver LoginForm.js / /api/auth/session) --
 * este endpoint solo decide si, dado ese token ya verificado como
 * platform_admin, se autoriza a construir un contexto de
 * impersonación para una empresa concreta, y dónde queda esa
 * decisión (cookie + fila de auditoría).
 ******************************************************************/

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { SESSION_COOKIE, IMPERSONATION_COOKIE } from "@/lib/auth/authenticatedContext";
import { ROLES } from "@/lib/auth/permissions.mjs";
import { canStartImpersonation, isCompanyImpersonable, signImpersonationCookie, verifyImpersonationCookie } from "@/lib/auth/impersonationCore.mjs";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

function cookieValue(request, name) {
  const direct = request?.cookies?.get?.(name)?.value;
  if (direct) return direct;
  const cookies = request?.headers?.get?.("cookie") || "";
  const match = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

async function resolveRealPlatformAdmin(db, token) {
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  if (data.user.app_metadata?.role !== ROLES.PLATFORM_ADMIN) return null;
  return data.user;
}

/******************************************************************
 * POST -- iniciar impersonación.
 * Body: { accessToken, companyId, portal }
 * `accessToken`: el token de Supabase que Root YA tiene en su sesión
 * real (obtenido client-side vía supabase.auth.getSession(), nunca un
 * nuevo login). `portal`: el portal desde el que se solicita (debe ser
 * "root" -- §6 del encargo: solo Root puede iniciar esto).
 ******************************************************************/
export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida.", code: "INVALID_JSON" }, { status: 400 });
  }

  const db = getSupabaseAdminClient();
  const accessToken = String(payload?.accessToken || "");
  const companyId = String(payload?.companyId || "").trim();
  const requestedPortal = String(payload?.portal || "").trim() || "root";

  const rootUser = await resolveRealPlatformAdmin(db, accessToken);
  if (!rootUser) {
    return NextResponse.json({ error: "Sesión inválida o cuenta sin permisos de Root.", code: "AUTH_REQUIRED" }, { status: 401 });
  }
  // §6: verificación explícita, server-side, independiente de cualquier
  // valor que el frontend pudiera enviar -- canStartImpersonation solo
  // usa datos ya confirmados por Supabase Auth (rootUser.app_metadata),
  // nunca el body de la solicitud.
  if (!canStartImpersonation({ realRole: rootUser.app_metadata?.role, realPortal: requestedPortal })) {
    return NextResponse.json({ error: "Solo Root puede iniciar una impersonación.", code: "IMPERSONATION_FORBIDDEN" }, { status: 403 });
  }
  if (!companyId) {
    return NextResponse.json({ error: "Selecciona una empresa.", code: "COMPANY_REQUIRED" }, { status: 400 });
  }

  const { data: company, error: companyError } = await db
    .from("companies")
    .select("id,business_name,trade_name,status,relationship_type")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) {
    return NextResponse.json({ error: "No fue posible validar la empresa.", code: "COMPANY_READ_FAILED" }, { status: 500 });
  }
  if (!isCompanyImpersonable(company)) {
    return NextResponse.json({ error: "La empresa no existe o no es una empresa cliente.", code: "COMPANY_NOT_IMPERSONABLE" }, { status: 404 });
  }

  // Firmar ANTES de escribir nada en BD: si falta IMPERSONATION_HMAC_SECRET
  // en este entorno, se rechaza aquí mismo -- nunca queda una fila de
  // auditoría huérfana para una impersonación que no llegó a establecer
  // una cookie válida.
  let signedCookie;
  try {
    signedCookie = signImpersonationCookie({
      secret: process.env.IMPERSONATION_HMAC_SECRET,
      rootUserId: rootUser.id,
      companyId: company.id,
    });
  } catch (signError) {
    console.error("[impersonation:sign]", signError?.message);
    return NextResponse.json({ error: "La impersonación no está disponible en este entorno (falta configuración de seguridad).", code: "IMPERSONATION_NOT_CONFIGURED" }, { status: 500 });
  }

  // A lo sumo una sesión de impersonación abierta por Root a la vez (ver
  // constraint en la migración) -- si había una previa sin cerrar
  // (p.ej. navegó directo a otra empresa sin pasar por "Salir"), se cierra
  // aquí mismo como "revoked" antes de abrir la nueva.
  const nowIso = new Date().toISOString();
  await db
    .from("impersonation_sessions")
    .update({ ended_at: nowIso, ended_reason: "revoked" })
    .eq("root_user_id", rootUser.id)
    .is("ended_at", null);

  const { data: sessionRow, error: sessionError } = await db
    .from("impersonation_sessions")
    .insert({ root_user_id: rootUser.id, company_id: company.id, started_at: nowIso })
    .select("id,started_at")
    .single();
  if (sessionError) {
    console.error("[impersonation:start]", sessionError);
    return NextResponse.json({ error: "No fue posible iniciar la impersonación.", code: "IMPERSONATION_START_FAILED" }, { status: 500 });
  }

  const response = NextResponse.json({
    data: {
      sessionId: sessionRow.id,
      companyId: company.id,
      companyName: company.trade_name || company.business_name,
      startedAt: sessionRow.started_at,
    },
  });
  // El token real de Root queda disponible en ESTE origen (cliente.
  // parkfacilapp.cl) también -- necesario porque las cookies son
  // host-only en este proyecto (sin dominio compartido entre
  // subdominios, ver operatorAccessUrl.mjs) y cada solicitud posterior
  // vuelve a verificar este mismo token real vía db.auth.getUser, nunca
  // confía solo en la cookie de impersonación.
  response.cookies.set(SESSION_COOKIE, accessToken, { ...COOKIE_OPTIONS, maxAge: 55 * 60 });
  response.cookies.set(IMPERSONATION_COOKIE, signedCookie, { ...COOKIE_OPTIONS, maxAge: 55 * 60 });
  return response;
}

/******************************************************************
 * GET -- estado actual de impersonación (para la barra "Modo Root").
 ******************************************************************/
export async function GET(request) {
  const db = getSupabaseAdminClient();
  const token = cookieValue(request, SESSION_COOKIE);
  const rawImpersonationCookie = cookieValue(request, IMPERSONATION_COOKIE);

  if (!token || !rawImpersonationCookie) {
    return NextResponse.json({ data: { impersonating: false } });
  }
  const rootUser = await resolveRealPlatformAdmin(db, token);
  if (!rootUser) {
    return NextResponse.json({ data: { impersonating: false } });
  }

  let impersonatedCompanyId = null;
  try {
    const verified = verifyImpersonationCookie({
      secret: process.env.IMPERSONATION_HMAC_SECRET,
      rootUserId: rootUser.id,
      cookieValue: rawImpersonationCookie,
    });
    if (verified.ok) impersonatedCompanyId = verified.companyId;
  } catch (secretError) {
    console.error("[impersonation:status:verify]", secretError?.message);
  }
  if (!impersonatedCompanyId) {
    return NextResponse.json({ data: { impersonating: false } });
  }

  const [{ data: company }, { data: session }] = await Promise.all([
    db.from("companies").select("id,business_name,trade_name").eq("id", impersonatedCompanyId).maybeSingle(),
    db.from("impersonation_sessions").select("id,started_at").eq("root_user_id", rootUser.id).eq("company_id", impersonatedCompanyId).is("ended_at", null).maybeSingle(),
  ]);

  return NextResponse.json({
    data: {
      impersonating: true,
      companyId: impersonatedCompanyId,
      companyName: company?.trade_name || company?.business_name || impersonatedCompanyId,
      startedAt: session?.started_at || null,
      rootEmail: rootUser.email,
    },
  });
}

/******************************************************************
 * DELETE -- salir de la impersonación, vuelve a Root.
 ******************************************************************/
export async function DELETE(request) {
  const db = getSupabaseAdminClient();
  const token = cookieValue(request, SESSION_COOKIE);
  const rootUser = await resolveRealPlatformAdmin(db, token);

  if (rootUser) {
    const { error } = await db
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString(), ended_reason: "manual" })
      .eq("root_user_id", rootUser.id)
      .is("ended_at", null);
    if (error) console.error("[impersonation:stop]", error);
  }

  const response = NextResponse.json({ data: { impersonating: false } });
  response.cookies.set(SESSION_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  response.cookies.set(IMPERSONATION_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
