// Reportes de cupones (SOL-2026-10-19-002, etapa B). Funciones puras: reciben
// filas ya acotadas por scope (empresa/estacionamientos) y devuelven lo que
// muestran la pestaña «Cupones» de Reportes Off Street y el resumen de /cupones.
// El cobro a las tiendas lo hace el cliente fuera del sistema (decisión del
// usuario): estos reportes le sirven de respaldo (canjes y monto descontado).
import { OPERATIONAL_TIME_ZONE } from "../dataEntry.mjs";
import { couponBenefitText } from "../pos/posCoupon.mjs";

function operationalParts(value, timeZone = OPERATIONAL_TIME_ZONE) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, date: `${parts.day}-${parts.month}-${parts.year}`, time: `${parts.hour}:${parts.minute}` };
}

// Día operacional (America/Santiago) de un instante, "AAAA-MM-DD" o null.
export function operationalIsoDate(value, timeZone = OPERATIONAL_TIME_ZONE) {
  return operationalParts(value, timeZone)?.iso || null;
}

function inRange(value, dateFrom, dateTo) {
  const day = operationalIsoDate(value);
  if (!day) return false;
  if (dateFrom && day < dateFrom) return false;
  if (dateTo && day > dateTo) return false;
  return true;
}

// Una fila por canje: estadía PAID con cupón + datos del cupón.
export function toCouponRedemptionRow(stay, coupon, { parkingName = "", companyName = "" } = {}) {
  const exit = operationalParts(stay?.exit_at);
  const subtotal = Number(stay?.subtotal_amount);
  return {
    id: stay?.id || null,
    date: exit?.date || "-",
    time: exit?.time || "-",
    ticket: stay?.code || "-",
    plate: stay?.license_plate || "-",
    parkingName,
    companyName,
    operator: stay?.exit_operator_name || "-",
    couponCode: stay?.coupon_code || coupon?.code || "-",
    campaign: coupon?.name || "-",
    merchant: coupon?.redeemingMerchantName || coupon?.merchantName || "-",
    benefit: couponBenefitText(coupon?.benefitType, coupon?.benefitValue) || "-",
    subtotalAmount: Number.isFinite(subtotal) ? subtotal : 0,
    discountAmount: Number(stay?.discount_amount) || 0,
    amount: Number(stay?.total_amount) || 0,
    paymentMethod: stay?.payment_method || null,
  };
}

// Descuento y cantidad de cupones por turno (cierre de caja), desde las
// estadías pagadas con cupón de esos turnos.
export function couponTotalsByShift(stays) {
  const totals = new Map();
  for (const stay of Array.isArray(stays) ? stays : []) {
    if (!stay?.payment_shift_id || !stay?.coupon_id) continue;
    const current = totals.get(stay.payment_shift_id) || { couponCount: 0, couponDiscountAmount: 0 };
    current.couponCount += 1;
    current.couponDiscountAmount += Number(stay.discount_amount) || 0;
    totals.set(stay.payment_shift_id, current);
  }
  return totals;
}

// Resumen por tienda ("merchant") o por campaña ("campaign") del período:
// - emitidos: creados en el período;
// - entregados: impresos o enviados en el período;
// - canjeados: canjeados en el período, con su descuento total;
// - vencidos sin usar: vencidos en el período sin canjear;
// - % de canje: de los emitidos en el período, cuántos ya fueron canjeados.
export function summarizeCoupons(coupons, discountByCouponId, { dateFrom = null, dateTo = null, groupBy = "merchant", now = new Date() } = {}) {
  const groups = new Map();
  const nowMs = now instanceof Date ? now.getTime() : Date.now();
  for (const coupon of Array.isArray(coupons) ? coupons : []) {
    const key = groupBy === "campaign" ? `${coupon.name || "-"}|${coupon.redeemingMerchantName || "-"}` : coupon.redeemingMerchantId || coupon.redeemingMerchantName || "-";
    const group = groups.get(key) || {
      key,
      merchant: coupon.redeemingMerchantName || "-",
      campaign: groupBy === "campaign" ? coupon.name || "-" : "",
      issued: 0, issuedRedeemed: 0, delivered: 0, redeemed: 0, expiredUnused: 0, discountAmount: 0,
    };
    if (inRange(coupon.createdAt, dateFrom, dateTo)) {
      group.issued += 1;
      if (coupon.redeemedAt) group.issuedRedeemed += 1;
    }
    if (coupon.deliveredAt && inRange(coupon.deliveredAt, dateFrom, dateTo)) group.delivered += 1;
    if (coupon.redeemedAt && inRange(coupon.redeemedAt, dateFrom, dateTo)) {
      group.redeemed += 1;
      group.discountAmount += Number(discountByCouponId?.get?.(coupon.id)) || 0;
    }
    const expiresMs = Date.parse(coupon.expiresAt);
    if (!coupon.redeemedAt && Number.isFinite(expiresMs) && expiresMs <= nowMs && inRange(coupon.expiresAt, dateFrom, dateTo)) group.expiredUnused += 1;
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((group) => group.issued || group.delivered || group.redeemed || group.expiredUnused)
    .map(({ issuedRedeemed, ...group }) => ({ ...group, redemptionRate: group.issued ? Math.round((issuedRedeemed / group.issued) * 1000) / 10 : null }))
    .sort((a, b) => b.redeemed - a.redeemed || b.issued - a.issued || a.merchant.localeCompare(b.merchant) || a.campaign.localeCompare(b.campaign));
}
