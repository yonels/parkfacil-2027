import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

const allowed = {
  status: ["active", "inactive", "draft", "archived"],
  type: ["monthly_subscription", "per_transaction", "per_parking", "equipment_bundle", "implementation_only", "custom"],
  currency: ["CLP", "UF", "USD"],
  billingMode: ["monthly", "annual", "one_time", "per_transaction", "mixed"],
};
const text = (value) => String(value || "").trim();
const number = (value) => Number(value || 0);
const list = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value).split(",").map(text).filter(Boolean);

function map(row) {
  return { id: row.id, codigo: row.code, nombre: row.name, descripcion: row.description, estado: row.status, tipo: row.type, moneda: row.currency, modalidadCobro: row.billing_mode, monthlyFee: Number(row.monthly_fee), annualFee: Number(row.annual_fee), implementationFee: Number(row.implementation_fee), transactionFee: Number(row.transaction_fee), deviceFee: Number(row.device_fee), parkingFee: Number(row.parking_fee), supportFee: Number(row.support_fee), discountPercentage: Number(row.discount_percentage), minimumMonthlyCharge: Number(row.minimum_monthly_charge), estacionamientosIncluidos: row.included_parkings, dispositivosIncluidos: row.included_devices, usuariosIncluidos: row.included_users, modulos: row.modules || [], equipamiento: row.equipment || [], limites: [], soporte: [], implementacion: [], capacitacion: [], reportes: [], integraciones: [], condiciones: [], vigencia: "Sin vigencia definida", fechaCreacion: row.created_at?.slice(0, 10), contractIds: [], observaciones: row.notes || row.description };
}

export async function GET(request) {
  const actor = await authenticateRequest(request);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  const { data, error } = await getSupabaseAdminClient().from("commercial_plans").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "No fue posible cargar los planes.", code: error.code }, { status: 500 });
  return NextResponse.json({ data: (data || []).map(map), permissions: { canCreate: actor.isPlatformAdmin } });
}

export async function POST(request) {
  const actor = await authenticateRequest(request);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  if (!actor.isPlatformAdmin) return NextResponse.json({ error: "Solo ParkFacil Root puede crear planes." }, { status: 403 });
  const input = await request.json();
  const numeric = ["monthlyFee","annualFee","implementationFee","transactionFee","deviceFee","parkingFee","supportFee","discountPercentage","minimumMonthlyCharge","includedParkings","includedDevices","includedUsers"];
  if (!text(input.code) || !text(input.name) || !allowed.status.includes(input.status) || !allowed.type.includes(input.type) || !allowed.currency.includes(input.currency) || !allowed.billingMode.includes(input.billingMode) || numeric.some((key) => !Number.isFinite(number(input[key])) || number(input[key]) < 0) || number(input.discountPercentage) > 100) return NextResponse.json({ error: "Revisa los datos obligatorios y valores del plan." }, { status: 400 });
  const row = { code: text(input.code).toUpperCase(), name: text(input.name), description: text(input.description), status: input.status, type: input.type, currency: input.currency, billing_mode: input.billingMode, monthly_fee: number(input.monthlyFee), annual_fee: number(input.annualFee), implementation_fee: number(input.implementationFee), transaction_fee: number(input.transactionFee), device_fee: number(input.deviceFee), parking_fee: number(input.parkingFee), support_fee: number(input.supportFee), discount_percentage: number(input.discountPercentage), minimum_monthly_charge: number(input.minimumMonthlyCharge), included_parkings: number(input.includedParkings), included_devices: number(input.includedDevices), included_users: number(input.includedUsers), modules: list(input.modules), equipment: list(input.equipment), notes: text(input.notes), created_by: actor.id };
  const { data, error } = await getSupabaseAdminClient().from("commercial_plans").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "Ya existe un plan con ese código." : "No fue posible crear el plan.", code: error.code }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ data: map(data) }, { status: 201 });
}
