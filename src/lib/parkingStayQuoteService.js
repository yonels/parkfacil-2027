import { resolveStayQuoteAvailability, splitChileTaxFromTotal } from "./dataEntry.mjs";
import { calculateScheduledParkingCharge, selectActiveRate } from "./parkingRates.mjs";
import { listParkingRates } from "./parkingRatesRepository.js";

function mapBlockedReason(reason) {
  if (reason === "ACTIVE_RATE_NOT_FOUND") {
    return "NO_ACTIVE_RATE";
  }

  return reason || "UNKNOWN";
}

async function getActiveRate(db, parkingId) {
  const rates = await listParkingRates(db, parkingId);
  return selectActiveRate(rates);
}

async function getCoupon(db, rawToken, companyId) {
  if (!rawToken) return null;

  const token = String(rawToken).replace(/^PFC-COUPON:/i, "").trim();
  const { data, error } = await db.from("coupons").select("*").eq("qr_token", token).maybeSingle();

  if (error || !data) throw new Error("COUPON_NOT_FOUND");

  const now = Date.now();
  if (data.status !== "ACTIVE" || data.redeemed_at) throw new Error("COUPON_ALREADY_USED");
  if (!companyId || data.company_id !== companyId) throw new Error("COUPON_WRONG_COMPANY");
  if (new Date(data.valid_from).getTime() > now) throw new Error("COUPON_NOT_YET_VALID");
  if (new Date(data.expires_at).getTime() <= now) throw new Error("COUPON_EXPIRED");

  return data;
}

export async function quoteParkingStay(db, stay, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const couponToken = options.couponToken || null;

  const rate = await getActiveRate(db, stay.parking_id);
  if (!rate) {
    return resolveStayQuoteAvailability(null, stay.entry_at, now);
  }

  const { data: parking } = await db.from("parkings").select("company_id").eq("id", stay.parking_id).maybeSingle();
  if (!parking) throw new Error("PARKING_NOT_FOUND");

  const coupon = await getCoupon(db, couponToken, parking.company_id);
  const effectiveRate = coupon?.benefit_type === "FREE_MINUTES"
    ? { ...rate, freePeriodSeconds: Number(rate.freePeriodSeconds || 0) + Number(coupon.benefit_value) * 60 }
    : rate;

  const availability = resolveStayQuoteAvailability(effectiveRate, stay.entry_at, now);
  if (availability.blocked) {
    return { ...availability, rate };
  }

  const { charge } = availability;
  const baseCharge = calculateScheduledParkingCharge(rate, stay.entry_at, now);
  const subtotal = Math.max(0, baseCharge.amount);

  let discount = Math.max(0, subtotal - charge.amount);
  if (coupon?.benefit_type === "PERCENTAGE") {
    discount = Math.floor(subtotal * Math.min(100, Number(coupon.benefit_value)) / 100);
  }
  if (coupon?.benefit_type === "FIXED_AMOUNT") {
    discount = Math.min(subtotal, Number(coupon.benefit_value));
  }

  const amounts = splitChileTaxFromTotal(Math.max(0, subtotal - discount));

  return {
    blocked: false,
    ...amounts,
    subtotal,
    discount,
    elapsedSeconds: availability.elapsedSeconds,
    elapsedMinutes: availability.elapsedMinutes,
    rate,
    charge,
    coupon: coupon
      ? {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        benefitType: coupon.benefit_type,
        value: Number(coupon.benefit_value),
      }
      : null,
  };
}

function resolveBillableMinutes(quote) {
  if (!quote || quote.blocked) return null;

  if (Number.isFinite(quote.charge?.chargedMinutes)) {
    return Number(quote.charge.chargedMinutes);
  }

  if (Number.isFinite(quote.charge?.chargeableSeconds)) {
    return Math.max(0, Math.floor(Number(quote.charge.chargeableSeconds) / 60));
  }

  return null;
}

export function toPagueAquiQuote({ stay, parkingName, quote, calculatedAt = new Date() }) {
  const payable = !quote?.blocked;
  const amount = payable ? Number(quote?.total || 0) : null;

  return {
    stayId: stay.id,
    stayCode: stay.code,
    parkingId: stay.parking_id,
    parkingName: parkingName || "Estacionamiento",
    licensePlate: stay.license_plate,
    entryAt: stay.entry_at,
    calculatedAt: calculatedAt.toISOString(),
    elapsedMinutes: Number.isFinite(quote?.elapsedMinutes) ? Number(quote.elapsedMinutes) : null,
    billableMinutes: resolveBillableMinutes(quote),
    rateId: quote?.rate?.id || stay.rate_id || null,
    rateName: quote?.rate?.name || stay.rate_name || null,
    billingMode: quote?.rate?.billingMode || stay.billing_mode || null,
    currency: quote?.rate?.currency || "CLP",
    amount,
    status: payable ? "QUOTE_READY" : "QUOTE_BLOCKED",
    payable,
    blockedReason: payable ? null : mapBlockedReason(quote?.reason),
  };
}

export async function quoteParkingStayById(db, stayId, options = {}) {
  const { data: stay, error } = await db
    .from("parking_stays")
    .select("id,code,parking_id,license_plate,entry_at,status,rate_id,rate_name,billing_mode")
    .eq("id", stayId)
    .maybeSingle();

  if (error) throw error;
  if (!stay) {
    return { ok: false, code: "STAY_NOT_FOUND", message: "No existe la estadía solicitada." };
  }

  if (stay.status !== "OPEN") {
    return { ok: false, code: "STAY_NOT_OPEN", message: "La estadía no está pendiente de pago." };
  }

  const { data: parking } = await db
    .from("parkings")
    .select("id,name")
    .eq("id", stay.parking_id)
    .maybeSingle();

  const calculatedAt = options.now instanceof Date ? options.now : new Date();
  const quote = await quoteParkingStay(db, stay, { ...options, now: calculatedAt });

  return {
    ok: true,
    quote: toPagueAquiQuote({
      stay,
      parkingName: parking?.name || "Estacionamiento",
      quote,
      calculatedAt,
    }),
  };
}
