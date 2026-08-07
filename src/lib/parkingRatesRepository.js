import "server-only";
import { classifyRateCompliance } from "@/lib/parkingRates.mjs";

const mapBlock = (row) => ({ id: row.id, sequence: row.sequence, durationSeconds: row.duration_seconds, amount: Number(row.amount), repeatAfter: row.repeat_after });
function mapRate(row, blocks) {
  const rate = {
    id: row.id, parkingId: row.parking_id, areaId: row.area_id, name: row.name, billingMode: row.billing_mode,
    currency: row.currency, minuteAmount: row.minute_amount == null ? null : Number(row.minute_amount),
    freePeriodSeconds: row.free_period_seconds, multiplyBySpaces: row.multiply_by_spaces,
    dailyFlatAmount: row.daily_flat_amount == null ? null : Number(row.daily_flat_amount),
    // Campos heredados de un modelo de "estadía nocturna" (valor fijo) incompatible con
    // las dos únicas modalidades legales para <24h. Se conservan solo para lectura de
    // historial; el motor de cálculo ya no los usa (ver classifyRateCompliance).
    regularStartTime: row.regular_start_time?.slice(0, 5) || null, regularEndTime: row.regular_end_time?.slice(0, 5) || null,
    overnightEndTime: row.overnight_end_time?.slice(0, 5) || null,
    overnightFlatAmount: row.overnight_flat_amount == null ? null : Number(row.overnight_flat_amount),
    validFrom: row.valid_from, validUntil: row.valid_until, status: row.status, notes: row.notes || "",
    blocks: blocks.filter((block) => block.rate_id === row.id).map(mapBlock).sort((a, b) => a.sequence - b.sequence),
  };
  return { ...rate, compliance: classifyRateCompliance(rate) };
}

export async function listParkingRates(db, parkingId) {
  const { data: rates, error } = await db.from("parking_rates").select("*").eq("parking_id", parkingId).order("created_at", { ascending: false });
  if (error) throw error;
  const rateIds = (rates || []).map((rate) => rate.id);
  if (!rateIds.length) return [];
  const { data: blocks, error: blockError } = await db.from("parking_rate_blocks").select("*").in("rate_id", rateIds).order("sequence");
  if (blockError) throw blockError;
  return (rates || []).map((rate) => mapRate(rate, blocks || []));
}

export async function createParkingRate(db, parkingId, input) {
  // El estado inicial se activa (si corresponde) recién después de insertar, para poder
  // clasificar la tarifa con sus tramos ya guardados antes de permitirle quedar ACTIVE.
  const requestedStatus = input.status;
  const { data: rate, error } = await db.from("parking_rates").insert({
    parking_id: parkingId, area_id: input.areaId || null, name: input.name, billing_mode: input.billingMode,
    currency: "CLP", minute_amount: input.billingMode === "EFFECTIVE_MINUTE" ? input.minuteAmount : null,
    free_period_seconds: input.freePeriodSeconds, multiply_by_spaces: input.multiplyBySpaces,
    daily_flat_amount: input.dailyFlatAmount || null, valid_from: input.validFrom,
    valid_until: input.validUntil || null, status: "DRAFT", notes: input.notes,
  }).select("*").single();
  if (error) throw error;
  if (input.billingMode === "EXPIRED_BLOCKS") {
    const { error: blockError } = await db.from("parking_rate_blocks").insert(input.blocks.map((block) => ({
      rate_id: rate.id, sequence: block.sequence, duration_seconds: block.durationSeconds,
      amount: block.amount, repeat_after: block.repeatAfter,
    })));
    if (blockError) throw blockError;
  }
  const rates = await listParkingRates(db, parkingId);
  let finalRate = rates.find((item) => item.id === rate.id);
  // Defensa adicional en la capa de persistencia: aunque la API ya validó la
  // configuración, una tarifa REQUIRES_REVIEW nunca puede activarse desde aquí.
  if (requestedStatus === "ACTIVE" && finalRate.compliance.status === "VALID") {
    const { data, error: statusError } = await db.from("parking_rates").update({ status: "ACTIVE" }).eq("id", rate.id).select("*").single();
    if (statusError) throw statusError;
    const updatedRates = await listParkingRates(db, parkingId);
    finalRate = updatedRates.find((item) => item.id === rate.id);
  }
  return finalRate;
}
