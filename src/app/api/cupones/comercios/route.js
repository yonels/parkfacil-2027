import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingActor } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
const clean = (value) => String(value || "").trim();
const map = (row) => ({ id: row.id, companyId: row.company_id, companyName: row.companies?.trade_name || row.companies?.business_name || row.company_id, code: row.code, name: row.name, contactName: row.contact_name, contactEmail: row.contact_email, status: row.status });

export async function GET(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.COUPONS_READ); if (auth.response) return auth.response;
  const actor = remainingActor(auth.context);
  let query = auth.db.from("coupon_merchants").select("*,companies(business_name,trade_name)").eq("status", "ACTIVE").order("name");
  if (!actor.isPlatformAdmin) query = query.eq("company_id", actor.companyId);
  const { data, error } = await query;
  return error ? NextResponse.json({ error: "No fue posible cargar las tiendas." }, { status: 503 }) : NextResponse.json({ data: (data || []).map(map) });
}

export async function POST(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.COUPONS_MANAGE); if (auth.response) return auth.response;
  const actor = remainingActor(auth.context); const input = await request.json();
  const companyId = actor.isPlatformAdmin ? clean(input.companyId) : actor.companyId;
  if (!companyId || !clean(input.name) || !clean(input.code)) return NextResponse.json({ error: "Empresa, codigo y nombre de tienda son obligatorios." }, { status: 400 });
  const company = await auth.db.from("companies").select("id").eq("id", companyId).eq("status", "active").eq("relationship_type", "client").maybeSingle();
  if (company.error || !company.data) return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });
  const row = { company_id: companyId, code: clean(input.code).toUpperCase(), name: clean(input.name), contact_name: clean(input.contactName), contact_email: clean(input.contactEmail).toLowerCase() || null };
  const { data, error } = await auth.db.from("coupon_merchants").insert(row).select("*,companies(business_name,trade_name)").single();
  if (error?.code === "23505") return NextResponse.json({ error: "La tienda ya esta registrada para esta empresa." }, { status: 409 });
  return error ? NextResponse.json({ error: "No fue posible registrar la tienda." }, { status: 503 }) : NextResponse.json({ data: map(data) }, { status: 201 });
}
