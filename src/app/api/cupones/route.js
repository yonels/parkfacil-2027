import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

const mapCoupon = (row) => ({ id: row.id, code: row.code, name: row.name, benefitType: row.benefit_type, value: Number(row.benefit_value), qrToken: row.qr_token, qrPayload: `PFC-COUPON:${row.qr_token}`, status: row.redeemed_at ? "REDEEMED" : row.status === "ACTIVE" && new Date(row.expires_at) <= new Date() ? "EXPIRED" : row.status, validFrom: row.valid_from, expiresAt: row.expires_at, redeemedAt: row.redeemed_at });
const errorResponse = (message, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET(request) {
  const actor = await authenticateRequest(request); if (!actor) return errorResponse("Debes iniciar sesión.", 401);
  const db = getSupabaseAdminClient(); let query = db.from("coupons").select("*").order("created_at", { ascending: false });
  if (!actor.isPlatformAdmin) {
    if (!actor.companyId) return NextResponse.json({ data: [] });
    query = query.eq("company_id", actor.companyId);
  }
  const { data, error } = await query;
  if (["PGRST205", "42P01"].includes(error?.code)) return errorResponse("El módulo de cupones está pendiente de activación en la base de datos.", 503);
  if (error) return errorResponse("No fue posible cargar los cupones.", 503);
  return NextResponse.json({ data: (data || []).map(mapCoupon) });
}

export async function POST(request) {
  const actor = await authenticateRequest(request); if (!actor) return errorResponse("Debes iniciar sesión.", 401);
  if (!actor.isAdmin && !actor.isSupervisor) return errorResponse("No tienes permisos para crear cupones.", 403);
  const input = await request.json(); const validFrom = new Date(input.validFrom); const expiresAt = new Date(input.expiresAt);
  if (!input.code?.trim() || !input.name?.trim()) return errorResponse("Código y nombre son obligatorios.");
  if (!['PERCENTAGE','FIXED_AMOUNT','FREE_MINUTES'].includes(input.benefitType) || !(Number(input.value) > 0)) return errorResponse("El beneficio no es válido.");
  if (!(expiresAt > validFrom)) return errorResponse("La expiración debe ser posterior al inicio de vigencia.");
  const { data, error } = await getSupabaseAdminClient().from("coupons").insert({ company_id: actor.companyId || null, code: input.code.trim().toUpperCase(), name: input.name.trim(), benefit_type: input.benefitType, benefit_value: Number(input.value), status: input.status === "ACTIVE" ? "ACTIVE" : "DRAFT", valid_from: validFrom.toISOString(), expires_at: expiresAt.toISOString(), created_by: actor.id }).select("*").single();
  if (error?.code === "23505") return errorResponse("El código del cupón ya existe.", 409);
  if (["PGRST205", "42P01"].includes(error?.code)) return errorResponse("El módulo de cupones está pendiente de activación en la base de datos.", 503);
  if (error) return errorResponse("No fue posible crear el cupón.", 503);
  return NextResponse.json({ data: mapCoupon(data) }, { status: 201 });
}
