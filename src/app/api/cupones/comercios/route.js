import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

const clean = (value) => String(value || "").trim();
const mapMerchant = (row) => ({ id: row.id, companyId: row.company_id, companyName: row.companies?.trade_name || row.companies?.business_name || row.company_id, code: row.code, name: row.name, contactName: row.contact_name, contactEmail: row.contact_email, status: row.status });

export async function GET(request) {
  const actor = await authenticateRequest(request); if (!actor) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  let query = getSupabaseAdminClient().from("coupon_merchants").select("*,companies(business_name,trade_name)").eq("status", "ACTIVE").order("name");
  if (!actor.isPlatformAdmin) {
    if (!actor.companyId) return NextResponse.json({ data: [] });
    query = query.eq("company_id", actor.companyId);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "No fue posible cargar las tiendas." }, { status: 503 });
  return NextResponse.json({ data: (data || []).map(mapMerchant) });
}

export async function POST(request) {
  const actor = await authenticateRequest(request); if (!actor) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  if (!actor.isAdmin && !actor.isSupervisor) return NextResponse.json({ error: "No tienes permisos para registrar tiendas." }, { status: 403 });
  const input = await request.json(); const companyId = actor.isPlatformAdmin ? clean(input.companyId) : actor.companyId;
  if (!companyId || !clean(input.name) || !clean(input.code)) return NextResponse.json({ error: "Empresa, código y nombre de tienda son obligatorios." }, { status: 400 });
  const row = { company_id: companyId, code: clean(input.code).toUpperCase(), name: clean(input.name), contact_name: clean(input.contactName), contact_email: clean(input.contactEmail).toLowerCase() || null };
  const { data, error } = await getSupabaseAdminClient().from("coupon_merchants").insert(row).select("*,companies(business_name,trade_name)").single();
  if (error?.code === "23505") return NextResponse.json({ error: "La tienda ya está registrada para esta empresa." }, { status: 409 });
  if (error) return NextResponse.json({ error: "No fue posible registrar la tienda." }, { status: 503 });
  return NextResponse.json({ data: mapMerchant(data) }, { status: 201 });
}
