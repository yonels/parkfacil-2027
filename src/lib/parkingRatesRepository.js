import { classifyRateCompliance } from "./parkingRates.mjs";

const mapBlock = (row) => ({ id: row.id, sequence: row.sequence, durationSeconds: row.duration_seconds, amount: Number(row.amount), repeatAfter: row.repeat_after });
function mapRate(row, blocks, usedRateIds = new Set()) {
  const hasCharges = usedRateIds.has(row.id);
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
    hasCharges,
  };
  // Una tarifa solo se puede editar en el mismo registro mientras nunca haya estado ACTIVE
  // ni haya participado en un cobro real (parking_stays.rate_id). Cualquier otro caso debe
  // pasar por replaceParkingRate para no alterar retroactivamente lo que ya se cobró.
  const editable = row.status === "DRAFT" && !hasCharges;
  return { ...rate, compliance: classifyRateCompliance(rate), editable };
}

async function fetchUsedRateIds(db, rateIds) {
  if (!rateIds.length) return new Set();
  const { data, error } = await db.from("parking_stays").select("rate_id").in("rate_id", rateIds).not("rate_id", "is", null);
  if (error) throw error;
  return new Set((data || []).map((row) => row.rate_id));
}

export async function listParkingRates(db, parkingId) {
  const { data: rates, error } = await db.from("parking_rates").select("*").eq("parking_id", parkingId).order("created_at", { ascending: false });
  if (error) throw error;
  const rateIds = (rates || []).map((rate) => rate.id);
  if (!rateIds.length) return [];
  const { data: blocks, error: blockError } = await db.from("parking_rate_blocks").select("*").in("rate_id", rateIds).order("sequence");
  if (blockError) throw blockError;
  const usedRateIds = await fetchUsedRateIds(db, rateIds);
  return (rates || []).map((rate) => mapRate(rate, blocks || [], usedRateIds));
}

export async function getParkingRate(db, parkingId, rateId) {
  const rates = await listParkingRates(db, parkingId);
  return rates.find((rate) => rate.id === rateId) || null;
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

export class RateNotEditableError extends Error {
  constructor() {
    super("RATE_NOT_EDITABLE");
    this.name = "RateNotEditableError";
    this.code = "RATE_NOT_EDITABLE";
  }
}

// Edición en el mismo registro: solo permitida mientras la tarifa nunca haya estado ACTIVE
// ni haya participado en un cobro real (rate.editable, ver mapRate). Cualquier otro caso
// debe rechazarse aquí mismo (defensa de dominio, no solo de la API) y resolverse con
// replaceParkingRate para no reescribir retroactivamente lo que ya se cobró.
export async function updateParkingRate(db, parkingId, rateId, input) {
  const current = await getParkingRate(db, parkingId, rateId);
  if (!current) return null;
  if (!current.editable) throw new RateNotEditableError();

  const { error: updateError } = await db.from("parking_rates").update({
    area_id: input.areaId || null, name: input.name, billing_mode: input.billingMode,
    minute_amount: input.billingMode === "EFFECTIVE_MINUTE" ? input.minuteAmount : null,
    free_period_seconds: input.freePeriodSeconds, multiply_by_spaces: input.multiplyBySpaces,
    daily_flat_amount: input.dailyFlatAmount || null, valid_from: input.validFrom,
    valid_until: input.validUntil || null, notes: input.notes, updated_at: new Date().toISOString(),
  }).eq("id", rateId).eq("status", "DRAFT");
  if (updateError) throw updateError;

  const { error: deleteError } = await db.from("parking_rate_blocks").delete().eq("rate_id", rateId);
  if (deleteError) throw deleteError;
  if (input.billingMode === "EXPIRED_BLOCKS") {
    const { error: blockError } = await db.from("parking_rate_blocks").insert(input.blocks.map((block) => ({
      rate_id: rateId, sequence: block.sequence, duration_seconds: block.durationSeconds,
      amount: block.amount, repeat_after: block.repeatAfter,
    })));
    if (blockError) throw blockError;
  }

  let finalRate = await getParkingRate(db, parkingId, rateId);
  // Misma defensa que createParkingRate: una tarifa REQUIRES_REVIEW nunca se activa aquí.
  if (input.status === "ACTIVE" && finalRate.compliance.status === "VALID") {
    const { error: statusError } = await db.from("parking_rates").update({ status: "ACTIVE" }).eq("id", rateId);
    if (statusError) throw statusError;
    finalRate = await getParkingRate(db, parkingId, rateId);
  }
  return finalRate;
}

// Nunca reescribe una tarifa que ya participó en cobros: si está ACTIVE, cierra su
// vigencia (valid_until = ahora, status = ENDED) preservando íntegramente sus valores
// históricos, y crea la nueva versión como una fila independiente. Si la creación de la
// nueva versión falla, revierte el cierre para no dejar el estacionamiento sin tarifa
// vigente por un error de la operación siguiente.
export async function replaceParkingRate(db, parkingId, rateId, input) {
  const current = await getParkingRate(db, parkingId, rateId);
  if (!current) return null;
  const endedAt = new Date().toISOString();
  let closedPrevious = false;
  if (current.status === "ACTIVE") {
    const { error: endError } = await db.from("parking_rates")
      .update({ valid_until: endedAt, status: "ENDED", updated_at: endedAt })
      .eq("id", rateId).eq("status", "ACTIVE");
    if (endError) throw endError;
    closedPrevious = true;
  }
  try {
    const next = await createParkingRate(db, parkingId, { ...input, validFrom: input.validFrom || endedAt });
    return { previous: await getParkingRate(db, parkingId, rateId), next };
  } catch (error) {
    if (closedPrevious) {
      await db.from("parking_rates")
        .update({ valid_until: current.validUntil, status: current.status, updated_at: new Date().toISOString() })
        .eq("id", rateId);
    }
    throw error;
  }
}
