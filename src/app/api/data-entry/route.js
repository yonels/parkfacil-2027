import { NextResponse } from "next/server";
import { formatChileanPlate, joinChileanPlate } from "@/lib/dataEntry.mjs";
import { quoteParkingStay } from "@/lib/parkingStayQuoteService";
import { authorizeOperationRequest, operationActor, operationAuthorizationError, requireOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";

const publicStayFields = "id,code,parking_id,license_plate,qr_token,status,entry_at,entry_operator_name,entry_source,entry_shift_id,exit_at,exit_operator_name,payment_shift_id,elapsed_minutes,rate_name,billing_mode,net_amount,tax_amount,total_amount,payment_method,payment_code,coupon_id,coupon_code,discount_amount,subtotal_amount";
const ticketParkingFields = "id,code,name,company_name,address,city,status,company:companies(business_name,address,district,city,rut_number,rut_dv,phone)";

function fail(message, status = 400, details) { return NextResponse.json({ error: message, details }, { status }); }
function code(prefix) { return `${prefix}-${new Date().toISOString().replace(/\D/g, "").slice(2, 14)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`; }

async function context(request, requestedParkingId = null) {
  let authorization;
  try {
  authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
  if (authorization.response) return { response: authorization.response };
  let parkingId = requestedParkingId;
  if (!parkingId && authorization.context.role === ROLES.OPERATOR) parkingId = authorization.assignedParkingIds?.[0] || null;
  if (!parkingId) {
    let query = authorization.db.from("parkings").select("id").eq("status", "ACTIVE").order("code").limit(1);
    if (authorization.scope.companyId) query = query.eq("company_id", authorization.scope.companyId);
    const result = await query;
    if (result.error) throw result.error;
    parkingId = result.data?.[0]?.id || null;
  }
  if (!parkingId) return { response: fail("El usuario no tiene un estacionamiento autorizado.", 404) };
  const parking = await requireOperationalParking(authorization.db, authorization.context, authorization.scope, parkingId);
  return { ...authorization, actor: { ...operationActor(authorization.context), parkingId: parking.id }, parking };
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return { response: denied };
    throw error;
  }
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

async function requireOpenPosShift(db, actor) {
  const { data, error } = await db.from("operator_shifts").select("id,operator_id,parking_id,status")
    .eq("operator_id", actor.id).eq("parking_id", actor.parkingId).eq("status", "OPEN").limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function GET(request) {
  const requestedParkingId = new URL(request.url).searchParams.get("parkingId");
  const current = await context(request, requestedParkingId); if (current.response) return current.response;
  const [parkingResult, stayResult] = await Promise.all([
    current.db.from("parkings").select(ticketParkingFields).eq("id", current.actor.parkingId).eq("status", "ACTIVE").maybeSingle(),
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
  const input = await request.json();
  const current = await context(request); if (current.response) return current.response;
  const isPosRequest = String(request.headers.get("x-parkfacil-portal") || "").toLowerCase() === "terminal";
  const posShift = isPosRequest ? await requireOpenPosShift(current.db, current.actor) : null;
  if (isPosRequest && !posShift && (input.action === "ENTRY" || input.action === "EXIT")) {
    return fail("Debes iniciar un turno antes de realizar esta operación en el POS.", 409, { code: "OPEN_SHIFT_REQUIRED" });
  }
  if (input.action === "ENTRY") {
    const plate = formatChileanPlate(input.plate || joinChileanPlate(input.platePrefix, input.plateSuffix));
    if (!plate) return fail("Ingresa una patente válida.", 400, { plate: "Formato requerido: CXPY93" });
    const assignedParkingId = current.actor.parkingId;
    const existing = await current.db
      .from("parking_stays")
      .select(publicStayFields)
      .eq("parking_id", assignedParkingId)
      .eq("license_plate", plate)
      .eq("status", "OPEN")
      .maybeSingle();
    if (existing.error) return fail("No fue posible validar la entrada del vehículo.", 503);
    if (existing.data) return fail("Este vehículo ya se encuentra dentro del estacionamiento.", 409);
    const row = { code: code("ING"), parking_id: assignedParkingId, license_plate: plate, entry_operator_id: current.actor.id, entry_operator_name: current.actor.name, entry_source: isPosRequest ? "POS" : "WEB", entry_shift_id: isPosRequest ? posShift.id : null };
    const { data, error } = await current.db.from("parking_stays").insert(row).select(publicStayFields).single();
    if (error?.code === "23505") return fail("Este vehículo ya se encuentra dentro del estacionamiento.", 409);
    if (error) return fail("No fue posible guardar el ingreso.", 503);
    const { data: parking } = await current.db.from("parkings").select(ticketParkingFields).eq("id", assignedParkingId).single();
    return NextResponse.json({ data: { stay: data, parking } }, { status: 201 });
  }
  if (["QUOTE", "EXIT"].includes(input.action)) {
    const stay = await findOpenStay(current.db, input, current.actor.parkingId);
    if (!stay) return fail("No existe una estadía abierta para el vehículo.", 404);
    let quote; try { quote = await quoteParkingStay(current.db, stay, { couponToken: input.couponToken, now: new Date() }); } catch (error) {
      const messages = { PARKING_NOT_FOUND: "El estacionamiento no existe.", COUPON_NOT_FOUND: "El cupón no existe.", COUPON_ALREADY_USED: "El cupón ya fue utilizado.", COUPON_WRONG_COMPANY: "El cupón no corresponde a este estacionamiento.", COUPON_NOT_YET_VALID: "El cupón todavía no está vigente.", COUPON_EXPIRED: "El cupón está vencido." };
      return fail(messages[error.message] || "No fue posible calcular la tarifa.", 409);
    }
    const { data: parking } = await current.db.from("parkings").select(ticketParkingFields).eq("id", stay.parking_id).single();
    // Sin tarifa válida: el vehículo/ticket/permanencia SÍ se devuelven (200), solo se
    // bloquea el cálculo/cobro. Un intento de EXIT igual se rechaza (defensa adicional;
    // la UI ya no ofrece el botón de pago en este estado).
    if (quote.blocked) {
      if (input.action === "EXIT") return fail("No existe una tarifa activa. No es posible calcular el cobro. Contacte al administrador.", 409);
      return NextResponse.json({ data: { stay, parking, quote } });
    }
    if (input.action === "QUOTE") return NextResponse.json({ data: { stay, parking, quote } });
    if (!['CASH','CARD'].includes(input.paymentMethod)) return fail("Selecciona contado o tarjeta.");
    const exitAt = new Date().toISOString(); const paymentCode = code("PAG");
    if (quote.coupon) {
      const { data: redeemed, error: redeemError } = await current.db.from("coupons").update({ status: "REDEEMED", redeemed_at: exitAt, redeemed_by: current.actor.id, redeemed_stay_id: stay.id }).eq("id", quote.coupon.id).eq("status", "ACTIVE").is("redeemed_at", null).select("id").maybeSingle();
      if (redeemError || !redeemed) return fail("El cupón ya fue utilizado o dejó de estar disponible.", 409);
    }
    const update = { status: "PAID", exit_at: exitAt, exit_operator_id: current.actor.id, exit_operator_name: current.actor.name, payment_shift_id: isPosRequest ? posShift.id : null, elapsed_minutes: quote.elapsedMinutes, rate_id: quote.rate.id, rate_name: quote.rate.name, billing_mode: quote.rate.billingMode, subtotal_amount: quote.subtotal, discount_amount: quote.discount, coupon_id: quote.coupon?.id || null, coupon_code: quote.coupon?.code || null, net_amount: quote.net, tax_amount: quote.tax, total_amount: quote.total, payment_method: input.paymentMethod, payment_code: paymentCode, updated_at: exitAt };
    const { data, error } = await current.db.from("parking_stays").update(update).eq("id", stay.id).eq("status", "OPEN").select(publicStayFields).single();
    if (error) {
      if (quote.coupon) {
        await current.db.from("coupons").update({ status: "ACTIVE", redeemed_at: null, redeemed_by: null, redeemed_stay_id: null }).eq("id", quote.coupon.id).eq("status", "REDEEMED").eq("redeemed_stay_id", stay.id).eq("redeemed_at", exitAt);
      }
      const shiftConflict = String(error.message || "").includes("PAYMENT_SHIFT_NOT_OPEN");
      return fail(shiftConflict ? "El turno dejó de estar abierto antes de confirmar el pago. Actualiza el POS." : "No fue posible cerrar y pagar la estadía.", shiftConflict ? 409 : 503);
    }
    return NextResponse.json({ data: { stay: data, parking, quote: { ...quote, paymentCode } } });
  }
  return fail("Acción operacional no reconocida.");
}
