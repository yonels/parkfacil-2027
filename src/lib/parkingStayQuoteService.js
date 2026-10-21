import { createHmac, timingSafeEqual } from "node:crypto";

import { resolveStayQuoteAvailability, splitChileTaxFromTotal } from "./dataEntry.mjs";
import { calculateScheduledParkingCharge, selectActiveRate } from "./parkingRates.mjs";
import { listParkingRates } from "./parkingRatesRepository.js";
import { listHolidayDatesForStay } from "./parkingHolidaysRepository.js";
import { buildChargeBreakdown } from "./parkingTimeBands.mjs";
import { signWebpayQuoteEvidence } from "./webpayQuoteEvidence.mjs";
import { quoteUncoveredIntervals } from "./releasedPayment/releasedChargeCore.mjs";
import { releasedStayCoverage } from "./releasedPayment/releasedStayCore.mjs";
import { parseCouponInput } from "./cupones/couponInput.mjs";

const POS_QUOTE_TTL_SECONDS = 120;
const POS_QUOTE_TTL_MS = POS_QUOTE_TTL_SECONDS * 1000;

function canonicalTimestamp(value) {
  const text = value instanceof Date ? value.toISOString() : String(value || "");
  const match = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/i);
  if (!match) throw new Error("INVALID_POS_QUOTE_TIMESTAMP");
  return `${match[1]}T${match[2]}.${String(match[3] || "").padEnd(6, "0")}Z`;
}

function textHex(value) {
  return Buffer.from(String(value || ""), "utf8").toString("hex");
}

// JSON con claves ordenadas en todos los niveles: el mismo texto aunque el objeto
// haya pasado por jsonb (que reordena claves) o por otro serializador.
export function stableJsonStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

// Cálculo firmado con desglose por franja horaria.
export const SNAPSHOT_VERSIONS_WITH_BREAKDOWN = Object.freeze(["POS_STAY_QUOTE_V2", "POS_STAY_QUOTE_V3"]);
export function snapshotHasChargeBreakdown(snapshot) {
  return SNAPSHOT_VERSIONS_WITH_BREAKDOWN.includes(snapshot?.version) && Boolean(snapshot?.chargeBreakdown);
}

// V2 (SOL-2026-10-08-003): agrega el desglose por franja firmado. Una cotización
// sin desglose (tarifas clásicas) sigue firmándose exactamente como V1.
// V3 (QA PRO2 2026-10-19, SOL-2026-10-11-001): igual que V2, pero el desglose se
// firma con claves ordenadas. El V2 firmaba JSON.stringify en el orden de
// inserción; al guardarse en jsonb (pos_card_payment_attempts.charge_snapshot) las
// claves se reordenan y la firma dejaba de verificar. V2 se sigue verificando
// tal como llega (cálculos emitidos antes de este cambio).
function canonicalizePosQuoteSnapshot(snapshot) {
  const v1 = canonicalizePosQuoteSnapshotV1(snapshot);
  if (snapshot.version === "POS_STAY_QUOTE_V3") return `POS_STAY_QUOTE_V3|${v1}|${textHex(stableJsonStringify(snapshot.chargeBreakdown ?? null))}`;
  if (snapshot.version !== "POS_STAY_QUOTE_V2") return v1;
  return `POS_STAY_QUOTE_V2|${v1}|${textHex(JSON.stringify(snapshot.chargeBreakdown ?? null))}`;
}

function canonicalizePosQuoteSnapshotV1(snapshot) {
  return [
    "POS_STAY_QUOTE_V1",
    String(snapshot.stayId).toLowerCase(),
    String(snapshot.parkingId).toLowerCase(),
    canonicalTimestamp(snapshot.stayUpdatedAt),
    canonicalTimestamp(snapshot.calculatedAt),
    canonicalTimestamp(snapshot.expiresAt),
    String(snapshot.rateId).toLowerCase(),
    canonicalTimestamp(snapshot.rateUpdatedAt),
    Number(snapshot.elapsedMinutes),
    Number(snapshot.subtotalAmount),
    Number(snapshot.discountAmount),
    Number(snapshot.netAmount),
    Number(snapshot.taxAmount),
    Number(snapshot.totalAmount),
    textHex(snapshot.rateName),
    textHex(snapshot.billingMode),
    textHex(snapshot.currency),
    textHex(snapshot.couponId),
    textHex(snapshot.couponCode),
    textHex(snapshot.couponBenefitType),
    Number(snapshot.couponBenefitValue),
  ].join("|");
}

export function signPosQuoteSnapshot(snapshot, secret) {
  if (Buffer.byteLength(String(secret || ""), "utf8") < 32) {
    throw new Error("POS_QUOTE_HMAC_SECRET_NOT_CONFIGURED");
  }
  return createHmac("sha256", secret)
    .update(canonicalizePosQuoteSnapshot(snapshot), "utf8")
    .digest("hex");
}

export function verifyPosQuoteSnapshot(snapshot, signature, secret) {
  if (!/^[0-9a-f]{64}$/i.test(String(signature || ""))) return false;
  const expected = signPosQuoteSnapshot(snapshot, secret);
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

export function buildPosQuoteSnapshot({ stay, quote, calculatedAt = new Date() }) {
  const signedAt = calculatedAt instanceof Date ? calculatedAt : new Date(calculatedAt);
  const expiresAt = new Date(signedAt.getTime() + POS_QUOTE_TTL_MS);
  const chargeBreakdown = quote?.breakdown || null;
  const snapshot = {
    version: chargeBreakdown ? "POS_STAY_QUOTE_V3" : "POS_STAY_QUOTE_V1",
    stayId: stay.id,
    stayCode: stay.code,
    parkingId: stay.parking_id,
    stayUpdatedAt: stay.updated_at,
    calculatedAt: signedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    rateId: quote?.rate?.id || stay.rate_id || null,
    rateUpdatedAt: quote?.rate?.updatedAt || null,
    elapsedMinutes: Number.isFinite(Number(quote?.elapsedMinutes)) ? Number(quote.elapsedMinutes) : null,
    subtotalAmount: Number(quote?.subtotal || 0),
    discountAmount: Number(quote?.discount || 0),
    netAmount: Number(quote?.net || 0),
    taxAmount: Number(quote?.tax || 0),
    totalAmount: Number(quote?.total || 0),
    rateName: quote?.rate?.name || stay.rate_name || null,
    billingMode: quote?.rate?.billingMode || stay.billing_mode || null,
    currency: quote?.rate?.currency || "CLP",
    couponId: quote?.coupon?.id || null,
    couponCode: quote?.coupon?.code || null,
    couponBenefitType: quote?.coupon?.benefitType || null,
    couponBenefitValue: Number.isFinite(Number(quote?.coupon?.value)) ? Number(quote.coupon.value) : null,
    ...(chargeBreakdown ? { chargeBreakdown } : {}),
  };

  return {
    ...snapshot,
    signature: signPosQuoteSnapshot(snapshot, process.env.POS_QUOTE_HMAC_SECRET),
  };
}

function mapBlockedReason(reason) {
  if (reason === "ACTIVE_RATE_NOT_FOUND") {
    return "NO_ACTIVE_RATE";
  }

  return reason || "UNKNOWN";
}

async function getActiveRate(db, parkingId, at = new Date()) {
  const rates = await listParkingRates(db, parkingId);
  return selectActiveRate(rates, at);
}

export async function getCoupon(db, rawToken, companyId) {
  if (!rawToken) return null;

  // QR ("PFC-COUPON:<token>") o código impreso (4 caracteres, o "PF-XXXXXXXX" anterior) escrito en el POS
  // (SOL-2026-10-19-002). El código se busca solo dentro de la empresa.
  const parsed = parseCouponInput(rawToken);
  if (!parsed) throw new Error("COUPON_NOT_FOUND");
  let query = db.from("coupons").select("*");
  query = parsed.kind === "code" ? query.eq("code", parsed.value).eq("company_id", companyId || "") : query.eq("qr_token", parsed.value);
  const { data, error } = await query.maybeSingle();

  if (error || !data) throw new Error("COUPON_NOT_FOUND");

  const now = Date.now();
  // Empresa primero: de un cupón ajeno no se revela su estado.
  if (!companyId || data.company_id !== companyId) throw new Error("COUPON_WRONG_COMPANY");
  if (data.status === "REDEEMED" || data.redeemed_at) throw new Error("COUPON_ALREADY_USED");
  if (data.status === "EXPIRED") throw new Error("COUPON_EXPIRED");
  // Borrador o anulado (SOL-2026-10-19-002): no es un cupón usado, es uno inactivo.
  if (data.status !== "ACTIVE") throw new Error("COUPON_INACTIVE");
  if (new Date(data.valid_from).getTime() > now) throw new Error("COUPON_NOT_YET_VALID");
  if (new Date(data.expires_at).getTime() <= now) throw new Error("COUPON_EXPIRED");

  return data;
}

export async function quoteParkingStay(db, stay, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const couponToken = options.couponToken || null;

  const rate = await getActiveRate(db, stay.parking_id, now);
  if (!rate) {
    return resolveStayQuoteAvailability(null, stay.entry_at, now);
  }

  const { data: parking } = await db.from("parkings").select("company_id").eq("id", stay.parking_id).maybeSingle();
  if (!parking) throw new Error("PARKING_NOT_FOUND");

  const coupon = await getCoupon(db, couponToken, parking.company_id);
  const effectiveRate = coupon?.benefit_type === "FREE_MINUTES"
    ? { ...rate, freePeriodSeconds: Number(rate.freePeriodSeconds || 0) + Number(coupon.benefit_value) * 60 }
    : rate;
  // Feriados del cliente: solo afectan tarifas por franja horaria.
  const chargeOptions = rate.timeBandsEnabled
    ? { holidays: await listHolidayDatesForStay(db, parking.company_id, stay.entry_at, now) }
    : {};

  const availability = resolveStayQuoteAvailability(effectiveRate, stay.entry_at, now, chargeOptions);
  if (availability.blocked) {
    return { ...availability, rate };
  }

  const { charge } = availability;
  const baseCharge = calculateScheduledParkingCharge(rate, stay.entry_at, now, chargeOptions);
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
    breakdown: rate.timeBandsEnabled ? buildChargeBreakdown(baseCharge, { rateId: rate.id }) : null,
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

// Off Street — Pago liberado (Etapa 2): estadía liberada. Solo se cobra el
// tiempo NO cubierto según las condiciones congeladas al ingreso (snapshot):
// cada intervalo no cubierto por separado, con la tarifa vigente del
// estacionamiento y sus franjas horarias y topes (P8a, 2026-10-18). Sin tiempo
// cobrable no se requiere tarifa ni cobro. Cupones no aplican.
export async function quoteReleasedParkingStay(db, stay, releasedSnapshot, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const coverage = releasedStayCoverage(releasedSnapshot, stay.entry_at, now);
  const elapsedMinutes = Math.floor(coverage.elapsedSeconds / 60);
  const released = {
    elapsedSeconds: coverage.elapsedSeconds,
    coveredSeconds: coverage.coveredSeconds,
    chargeableSeconds: coverage.chargeableSeconds,
    coveredMinutes: Math.floor(coverage.coveredSeconds / 60),
    chargeableMinutes: Math.floor(coverage.chargeableSeconds / 60),
  };
  if (!coverage.uncovered.length) {
    return { blocked: false, net: 0, tax: 0, total: 0, taxRate: 0.19, subtotal: 0, discount: 0, elapsedSeconds: coverage.elapsedSeconds, elapsedMinutes, rate: null, charge: null, coupon: null, breakdown: null, released: { ...released, intervals: [] } };
  }
  const rate = await getActiveRate(db, stay.parking_id, now);
  if (!rate) return { blocked: true, reason: "ACTIVE_RATE_NOT_FOUND", elapsedSeconds: coverage.elapsedSeconds, elapsedMinutes, released };
  let holidays = [];
  if (rate.timeBandsEnabled) {
    const { data: parking } = await db.from("parkings").select("company_id").eq("id", stay.parking_id).maybeSingle();
    if (!parking) throw new Error("PARKING_NOT_FOUND");
    holidays = await listHolidayDatesForStay(db, parking.company_id, stay.entry_at, now);
  }
  const charge = quoteUncoveredIntervals({ rate, intervals: coverage.uncovered, holidays });
  if (!charge.valid) {
    return { blocked: true, reason: charge.reason, elapsedSeconds: coverage.elapsedSeconds, elapsedMinutes, rate, charge, released };
  }
  const subtotal = charge.amount;
  return {
    blocked: false,
    ...splitChileTaxFromTotal(subtotal),
    subtotal,
    discount: 0,
    elapsedSeconds: coverage.elapsedSeconds,
    elapsedMinutes,
    rate,
    charge: { valid: true, amount: subtotal, chargeableSeconds: charge.chargedSeconds, chargedMinutes: Math.floor(charge.chargedSeconds / 60) },
    coupon: null,
    // Desglose firmado en la cotización POS (V2): intervalos no cubiertos.
    breakdown: { version: 1, kind: "RELEASED_PAYMENT", rateId: rate.id, coveredMinutes: released.coveredMinutes, chargeableMinutes: released.chargeableMinutes, amount: subtotal, intervals: charge.intervals },
    released: { ...released, intervals: charge.intervals },
  };
}

// Snapshot de Pago liberado de una estadía (null si no es liberada).
export async function loadReleasedStaySnapshot(db, stayId) {
  const { data, error } = await db.from("parking_stays").select("released_payment_authorization_id,released_payment_snapshot").eq("id", stayId).maybeSingle();
  if (error) throw error;
  return data?.released_payment_authorization_id ? data.released_payment_snapshot : null;
}

// Snapshots de las estadías liberadas abiertas de un estacionamiento
// (id -> snapshot).
export async function loadOpenReleasedSnapshots(db, parkingId) {
  const { data, error } = await db.from("parking_stays").select("id,released_payment_snapshot").eq("parking_id", parkingId).eq("status", "OPEN").not("released_payment_authorization_id", "is", null);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, row.released_payment_snapshot]));
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
    // Pago liberado: minutos cubiertos y cobrables (solo estadías liberadas).
    released: quote?.released ? { coveredMinutes: quote.released.coveredMinutes, chargeableMinutes: quote.released.chargeableMinutes } : null,
  };
}

export async function quoteParkingStayById(db, stayId, options = {}) {
  const { data: stay, error } = await db
    .from("parking_stays")
    .select("id,code,parking_id,license_plate,entry_at,status,rate_id,rate_name,billing_mode,updated_at")
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
  const releasedSnapshot = await loadReleasedStaySnapshot(db, stay.id);
  let quote = releasedSnapshot
    ? await quoteReleasedParkingStay(db, stay, releasedSnapshot, { now: calculatedAt })
    : await quoteParkingStay(db, stay, { ...options, now: calculatedAt });
  // Patente liberada sin tiempo cobrable: no hay nada que pagar; la salida
  // se registra en el POS sin cobro.
  if (releasedSnapshot && !quote.blocked && quote.total === 0) {
    quote = { blocked: true, reason: "RELEASED_NO_CHARGE", elapsedSeconds: quote.elapsedSeconds, elapsedMinutes: quote.elapsedMinutes, released: quote.released };
  }
  const publicQuote = toPagueAquiQuote({
    stay,
    parkingName: parking?.name || "Estacionamiento",
    quote,
    calculatedAt,
  });

  if (publicQuote.payable && options.includePosSnapshot === true) {
    publicQuote.snapshot = buildPosQuoteSnapshot({ stay, quote, calculatedAt });
  }

  // Cotización Webpay (Pague Aquí): nunca con cupón. El cupón solo existe en el cálculo
  // del POS (SOL-2026-10-19-002), que no usa quoteId, y un descuento que cubre todo
  // dejaba el total en $0, que create_webpay_stay_quote rechaza (INVALID_QUOTE_BREAKDOWN).
  if (publicQuote.payable && !quote.coupon && process.env.WEBPAY_QUOTE_HMAC_SECRET) {
    const evidence = signWebpayQuoteEvidence({
      stayId: stay.id,
      stayUpdatedAt: stay.updated_at,
      calculatedAt,
      rateId: quote.rate.id,
      rateUpdatedAt: quote.rate.updatedAt,
      rateBlocksSnapshot: quote.rate.blocks,
      elapsedMinutes: quote.elapsedMinutes,
      rateName: quote.rate.name,
      billingMode: quote.rate.billingMode,
      subtotalAmount: quote.subtotal,
      discountAmount: quote.discount,
      netAmount: quote.net,
      taxAmount: quote.tax,
      totalAmount: quote.total,
    }, process.env.WEBPAY_QUOTE_HMAC_SECRET);
    const { data: quoteId, error: snapshotError } = await db.rpc("create_webpay_stay_quote", {
      p_stay_id: stay.id,
      p_stay_updated_at: stay.updated_at,
      p_calculated_at: calculatedAt.toISOString(),
      p_rate_id: quote.rate.id,
      p_rate_updated_at: quote.rate.updatedAt,
      p_rate_blocks_snapshot: quote.rate.blocks.map((block) => ({
        id: block.id,
        sequence: block.sequence,
        durationSeconds: block.durationSeconds,
        amount: block.amount,
        repeatAfter: block.repeatAfter,
      })),
      p_elapsed_minutes: quote.elapsedMinutes,
      p_rate_name: quote.rate.name,
      p_billing_mode: quote.rate.billingMode,
      p_subtotal_amount: quote.subtotal,
      p_discount_amount: quote.discount,
      p_net_amount: quote.net,
      p_tax_amount: quote.tax,
      p_total_amount: quote.total,
      p_evidence: evidence,
    });
    if (snapshotError) throw snapshotError;
    publicQuote.quoteId = quoteId;
  }

  return {
    ok: true,
    quote: publicQuote,
  };
}
