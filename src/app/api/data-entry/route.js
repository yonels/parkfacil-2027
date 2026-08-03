import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { calculateChileTax, joinChileanPlate } from "@/lib/dataEntry.mjs";
import { calculateScheduledParkingCharge } from "@/lib/parkingRates.mjs";
import { listParkingRates } from "@/lib/parkingRatesRepository";

const allowedRoles = new Set(["operator", "supervisor", "company_admin", "organization_admin", "admin", "platform_admin"]);
const publicStayFields = "id,code,parking_id,license_plate,qr_token,status,entry_at,entry_operator_name,entry_source,exit_at,exit_operator_name,elapsed_minutes,rate_name,billing_mode,net_amount,tax_amount,total_amount,payment_method,payment_code,coupon_id,coupon_code,discount_amount,subtotal_amount";

function fail(message, status = 400, details) { return NextResponse.json({ error: message, details }, { status }); }
function code(prefix) { return `${prefix}-${new Date().toISOString().replace(/\D/g, "").slice(2, 14)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`; }

async function context(request) {
  const actor = await authenticateRequest(request);
  if (!actor || !allowedRoles.has(actor.role)) return null;
  return { actor, db: getSupabaseAdminClient() };
}

async function getActiveRate(db, parkingId) {
  const rates = await listParkingRates(db, parkingId);
  const now = Date.now();
  return rates.find((rate) => rate.status === "ACTIVE" && new Date(rate.validFrom).getTime() <= now && (!rate.validUntil || new Date(rate.validUntil).getTime() > now)) || null;
}

async function getCoupon(db, rawToken) {
  if (!rawToken) return null;
  const token = String(rawToken).replace(/^PFC-COUPON:/i, "").trim();
  const { data, error } = await db.from("coupons").select("*").eq("qr_token", token).maybeSingle();
  if (error || !data) throw new Error("COUPON_NOT_FOUND");
  const now = Date.now();
  if (data.status !== "ACTIVE" || data.redeemed_at) throw new Error("COUPON_ALREADY_USED");
  if (new Date(data.valid_from).getTime() > now) throw new Error("COUPON_NOT_YET_VALID");
  if (new Date(data.expires_at).getTime() <= now) throw new Error("COUPON_EXPIRED");
  return data;
}

async function quoteStay(db, stay, couponToken = null) {
  const rate = await getActiveRate(db, stay.parking_id);
  if (!rate) throw new Error("ACTIVE_RATE_NOT_FOUND");
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(stay.entry_at).getTime()) / 1000));
  const coupon = await getCoupon(db, couponToken);
  const effectiveRate = coupon?.benefit_type === "FREE_MINUTES" ? { ...rate, freePeriodSeconds: Number(rate.freePeriodSeconds || 0) + Number(coupon.benefit_value) * 60 } : rate;
  const charge = calculateScheduledParkingCharge(effectiveRate, stay.entry_at, new Date());
  if (!charge.valid || charge.requiresDailyPolicy) throw new Error("RATE_REQUIRES_REVIEW");
  const baseCharge = calculateScheduledParkingCharge(rate, stay.entry_at, new Date());
  const subtotal = Math.max(0, Math.round(baseCharge.amount));
  let discount = Math.max(0, subtotal - Math.round(charge.amount));
  if (coupon?.benefit_type === "PERCENTAGE") discount = Math.floor(subtotal * Math.min(100, Number(coupon.benefit_value)) / 100);
  if (coupon?.benefit_type === "FIXED_AMOUNT") discount = Math.min(subtotal, Number(coupon.benefit_value));
  const amounts = calculateChileTax(Math.max(0, subtotal - discount));
  return { ...amounts, subtotal, discount, elapsedMinutes: Math.max(1, Math.ceil(elapsedSeconds / 60)), rate, charge, coupon: coupon ? { id: coupon.id, code: coupon.code, name: coupon.name, benefitType: coupon.benefit_type, value: Number(coupon.benefit_value) } : null };
}

async function findOpenStay(db, input, assignedParkingId) {
  let query = db.from("parking_stays").select(publicStayFields).eq("status", "OPEN");
  if (assignedParkingId) query = query.eq("parking_id", assignedParkingId);
  if (input.stayId) query = query.eq("id", input.stayId);
  else if (input.qrToken) query = query.eq("qr_token", input.qrToken);
  else if (input.plate) query = query.eq("license_plate", input.plate.toUpperCase());
  else return null;
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request) {
  const current = await context(request); if (!current) return fail("Acceso permitido solo a operadores y administradores.", 403);
  if (!current.actor.parkingId) return fail("El usuario no tiene un estacionamiento asignado.", 409);
  const [parkingResult, stayResult] = await Promise.all([
    current.db.from("parkings").select("id,code,name,company_name,address,city,status").eq("id", current.actor.parkingId).eq("status", "ACTIVE").maybeSingle(),
    current.db.from("parking_stays").select(publicStayFields).eq("parking_id", current.actor.parkingId).eq("status", "OPEN").order("entry_at", { ascending: false }),
  ]);
  const { data: parking, error: parkingError } = parkingResult;
  const { data: stays, error: stayError } = stayResult;
  if (parkingError) return fail("No fue posible cargar el estacionamiento asignado.", 503);
  if (!parking) return fail("El estacionamiento asignado no está activo o no existe.", 409);
  const operationalStorageMissing = ["42P01", "PGRST204", "PGRST205"].includes(stayError?.code);
  if (stayError && !operationalStorageMissing) return fail("No fue posible cargar los vehículos estacionados.", 503);
  return NextResponse.json({
    data: {
      parking,
      stays: operationalStorageMissing ? [] : (stays || []),
      storageReady: !operationalStorageMissing,
      warning: operationalStorageMissing ? "El almacenamiento operacional todavía no está activado; la asignación sí fue cargada." : null,
      actor: { name: current.actor.name, role: current.actor.role, parkingId: current.actor.parkingId },
    },
  });
}

export async function POST(request) {
  const current = await context(request); if (!current) return fail("Acceso permitido solo a operadores y administradores.", 403);
  const input = await request.json();
  if (!current.actor.parkingId) return fail("El usuario no tiene un estacionamiento asignado.", 409);
  if (input.action === "ENTRY") {
    const plate = joinChileanPlate(input.platePrefix, input.plateSuffix);
    if (!plate) return fail("Ingresa los cuatro caracteres iniciales y los dos finales de la patente.", 400, { plate: "Formato requerido: CXPY-93" });
    const assignedParkingId = current.actor.parkingId;
    const row = { code: code("ING"), parking_id: assignedParkingId, license_plate: plate, entry_operator_id: current.actor.id, entry_operator_name: current.actor.name, entry_source: input.source === "POS" ? "POS" : "WEB" };
    const { data, error } = await current.db.from("parking_stays").insert(row).select(publicStayFields).single();
    if (error?.code === "23505") return fail("La patente ya tiene una estadía abierta en este parking.", 409);
    if (error) return fail("No fue posible guardar el ingreso.", 503);
    const { data: parking } = await current.db.from("parkings").select("id,code,name,company_name,address,city").eq("id", assignedParkingId).single();
    return NextResponse.json({ data: { stay: data, parking } }, { status: 201 });
  }
  if (["QUOTE", "EXIT"].includes(input.action)) {
    const stay = await findOpenStay(current.db, input, current.actor.parkingId);
    if (!stay) return fail("No existe una estadía abierta para el vehículo.", 404);
    let quote; try { quote = await quoteStay(current.db, stay, input.couponToken); } catch (error) {
      const messages = { ACTIVE_RATE_NOT_FOUND: "El parking no tiene una tarifa activa.", COUPON_NOT_FOUND: "El cupón no existe.", COUPON_ALREADY_USED: "El cupón ya fue utilizado.", COUPON_NOT_YET_VALID: "El cupón todavía no está vigente.", COUPON_EXPIRED: "El cupón está vencido." };
      return fail(messages[error.message] || "La tarifa requiere revisión administrativa.", 409);
    }
    const { data: parking } = await current.db.from("parkings").select("id,code,name,company_name,address,city").eq("id", stay.parking_id).single();
    if (input.action === "QUOTE") return NextResponse.json({ data: { stay, parking, quote } });
    if (!['CASH','CARD'].includes(input.paymentMethod)) return fail("Selecciona contado o tarjeta.");
    const exitAt = new Date().toISOString(); const paymentCode = code("PAG");
    if (quote.coupon) {
      const { data: redeemed, error: redeemError } = await current.db.from("coupons").update({ status: "REDEEMED", redeemed_at: exitAt, redeemed_by: current.actor.id, redeemed_stay_id: stay.id }).eq("id", quote.coupon.id).eq("status", "ACTIVE").is("redeemed_at", null).select("id").maybeSingle();
      if (redeemError || !redeemed) return fail("El cupón ya fue utilizado o dejó de estar disponible.", 409);
    }
    const update = { status: "PAID", exit_at: exitAt, exit_operator_id: current.actor.id, exit_operator_name: current.actor.name, elapsed_minutes: quote.elapsedMinutes, rate_id: quote.rate.id, rate_name: quote.rate.name, billing_mode: quote.rate.billingMode, subtotal_amount: quote.subtotal, discount_amount: quote.discount, coupon_id: quote.coupon?.id || null, coupon_code: quote.coupon?.code || null, net_amount: quote.net, tax_amount: quote.tax, total_amount: quote.total, payment_method: input.paymentMethod, payment_code: paymentCode, updated_at: exitAt };
    const { data, error } = await current.db.from("parking_stays").update(update).eq("id", stay.id).eq("status", "OPEN").select(publicStayFields).single();
    if (error) return fail("No fue posible cerrar y pagar la estadía.", 503);
    return NextResponse.json({ data: { stay: data, parking, quote: { ...quote, paymentCode } } });
  }
  return fail("Acción operacional no reconocida.");
}
