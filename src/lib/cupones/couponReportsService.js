// Datos reales de los reportes de cupones (SOL-2026-10-19-002, etapa B). Mismo
// patrón de aislamiento que offStreetRevenueService: recibe `scopedParkings` ya
// resuelto por la ruta y nunca consulta fuera de esos estacionamientos/empresas.
import { addDaysToIsoDate, filterRowsByExactOperationalDateRange, normalizePagination } from "../pos/activityReportCore.mjs";
import { fetchAllMatchingRows, offStreetParkings, resolveQueryParkingIds } from "../offStreetRevenueService.js";
import { summarizeCoupons, toCouponRedemptionRow } from "./couponReportsCore.mjs";

const redemptionStayFields = "id,code,license_plate,parking_id,exit_at,exit_operator_name,payment_method,subtotal_amount,discount_amount,total_amount,coupon_id,coupon_code";
const couponFields = "id,company_id,code,name,benefit_type,benefit_value,created_at,delivered_at,redeemed_at,expires_at,redeeming_merchant_id,issuing_merchant:coupon_merchants!coupons_merchant_id_fkey(name),redeeming_merchant:coupon_merchants!coupons_redeeming_merchant_id_fkey(name)";
const IN_CHUNK = 200;

function mapCoupon(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    code: row.code,
    name: row.name,
    benefitType: row.benefit_type,
    benefitValue: Number(row.benefit_value),
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    redeemedAt: row.redeemed_at,
    expiresAt: row.expires_at,
    redeemingMerchantId: row.redeeming_merchant_id,
    merchantName: row.issuing_merchant?.name || "",
    redeemingMerchantName: row.redeeming_merchant?.name || "",
  };
}

async function loadCouponsByIds(db, ids) {
  const byId = new Map();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let index = 0; index < unique.length; index += IN_CHUNK) {
    const { data, error } = await db.from("coupons").select(couponFields).in("id", unique.slice(index, index + IN_CHUNK));
    if (error) throw error;
    for (const row of data || []) byId.set(row.id, mapCoupon(row));
  }
  return byId;
}

// Pestaña «Cupones» de Reportes Off Street: un canje por fila (estadías PAID
// con cupón), filtradas por fecha de salida (día operacional) y scope.
export async function searchCouponRedemptions(db, scopedParkings, options = {}) {
  const { dateFrom = null, dateTo = null, parkingId = null, companyId = null, page, pageSize, all = false } = options;
  const { page: safePage, pageSize: safeSize, offset } = normalizePagination({ page, pageSize });
  const parkings = offStreetParkings(scopedParkings);
  const nameById = new Map(parkings.map((parking) => [parking.id, parking.name]));
  const companyNameById = new Map(parkings.map((parking) => [parking.id, parking.companyName || ""]));
  const { queryParkingIds } = resolveQueryParkingIds(parkings, { parkingId, companyId });
  if (!queryParkingIds.length) return { rows: [], total: 0, page: safePage, pageSize: safeSize, summary: { count: 0, discountAmount: 0 } };

  const queryFactory = () => {
    let q = db.from("parking_stays").select(redemptionStayFields).in("parking_id", queryParkingIds).eq("status", "PAID").not("coupon_id", "is", null);
    if (dateFrom) q = q.gte("exit_at", `${addDaysToIsoDate(dateFrom, -1)}T00:00:00.000Z`);
    if (dateTo) q = q.lte("exit_at", `${addDaysToIsoDate(dateTo, 1)}T23:59:59.999Z`);
    return q.order("exit_at", { ascending: false });
  };
  const widened = await fetchAllMatchingRows(queryFactory);
  const exactRows = filterRowsByExactOperationalDateRange(widened, "exit_at", dateFrom, dateTo);
  const pageRows = all ? exactRows : exactRows.slice(offset, offset + safeSize);
  const couponById = await loadCouponsByIds(db, pageRows.map((stay) => stay.coupon_id));
  const rows = pageRows.map((stay) => toCouponRedemptionRow(stay, couponById.get(stay.coupon_id), {
    parkingName: nameById.get(stay.parking_id) || "",
    companyName: companyNameById.get(stay.parking_id) || "",
  }));
  const summary = { count: exactRows.length, discountAmount: exactRows.reduce((sum, stay) => sum + (Number(stay.discount_amount) || 0), 0) };
  return { rows, total: exactRows.length, page: safePage, pageSize: all ? rows.length : safeSize, summary };
}

// Resumen de /cupones por tienda o campaña. `companyId` null = Root (todas).
export async function summarizeCompanyCoupons(db, { companyId = null, dateFrom = null, dateTo = null, groupBy = "merchant", now = new Date() } = {}) {
  const coupons = (await fetchAllMatchingRows(() => {
    let q = db.from("coupons").select(couponFields);
    if (companyId) q = q.eq("company_id", companyId);
    return q.order("created_at", { ascending: false });
  })).map(mapCoupon);
  const redeemedIds = coupons.filter((coupon) => coupon.redeemedAt).map((coupon) => coupon.id);
  const discountByCouponId = new Map();
  for (let index = 0; index < redeemedIds.length; index += IN_CHUNK) {
    const { data, error } = await db.from("parking_stays").select("coupon_id,discount_amount").in("coupon_id", redeemedIds.slice(index, index + IN_CHUNK)).eq("status", "PAID");
    if (error) throw error;
    for (const stay of data || []) discountByCouponId.set(stay.coupon_id, (discountByCouponId.get(stay.coupon_id) || 0) + (Number(stay.discount_amount) || 0));
  }
  return summarizeCoupons(coupons, discountByCouponId, { dateFrom, dateTo, groupBy, now });
}
