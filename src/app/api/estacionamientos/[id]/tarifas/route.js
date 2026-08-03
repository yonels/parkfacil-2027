import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getParking } from "@/lib/estacionamientosRepository";
import { createParkingRate, listParkingRates } from "@/lib/parkingRatesRepository";
import { validateOperationalRate } from "@/lib/parkingRates.mjs";
import { operationalError, validationError } from "@/lib/parkingApi";

function sanitize(input = {}) {
  const billingMode = ["EFFECTIVE_MINUTE", "EXPIRED_BLOCKS"].includes(input.billingMode) ? input.billingMode : null;
  return {
    name: String(input.name || "").trim().slice(0, 120),
    areaId: input.areaId || null,
    billingMode,
    minuteAmount: billingMode === "EFFECTIVE_MINUTE" ? Number(input.minuteAmount) : null,
    freePeriodSeconds: Math.max(0, Math.floor(Number(input.freePeriodMinutes || 0) * 60)),
    multiplyBySpaces: false,
    legalComplianceAccepted: input.legalComplianceAccepted === true,
    dailyFlatAmount: input.dailyFlatAmount === "" || input.dailyFlatAmount == null ? null : Number(input.dailyFlatAmount),
    regularStartTime: String(input.regularStartTime || ""),
    regularEndTime: String(input.regularEndTime || ""),
    overnightEndTime: String(input.overnightEndTime || ""),
    overnightFlatAmount: input.overnightFlatAmount === "" || input.overnightFlatAmount == null ? null : Number(input.overnightFlatAmount),
    validFrom: input.validFrom ? new Date(input.validFrom).toISOString() : null,
    validUntil: input.validUntil ? new Date(input.validUntil).toISOString() : null,
    status: input.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
    notes: String(input.notes || "").trim().slice(0, 500),
    blocks: (input.blocks || []).map((block, index) => ({
      sequence: index + 1,
      durationSeconds: Math.floor(Number(block.durationMinutes) * 60),
      amount: Number(block.amount),
      repeatAfter: block.repeatAfter === true,
    })),
  };
}

function validate(input) {
  const errors = validateOperationalRate(input);
  if (!input.name) errors.name = "El nombre es obligatorio.";
  if (!input.legalComplianceAccepted) errors.legalComplianceAccepted = "Debes confirmar el cumplimiento de la Ley 20.967.";
  if (!input.validFrom) errors.validFrom = "La fecha de inicio es obligatoria.";
  if (input.validUntil && input.validUntil <= input.validFrom) errors.validUntil = "La fecha de término debe ser posterior al inicio.";
  if (input.dailyFlatAmount != null && !(input.dailyFlatAmount >= 0)) errors.dailyFlatAmount = "Ingresa un valor diario válido.";
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(input.regularStartTime)) errors.regularStartTime = "Ingresa el inicio del horario regular.";
  if (!timePattern.test(input.regularEndTime)) errors.regularEndTime = "Ingresa el término del horario regular.";
  if (!timePattern.test(input.overnightEndTime)) errors.overnightEndTime = "Ingresa el término de la estadía nocturna.";
  if (input.regularStartTime === input.regularEndTime) errors.regularEndTime = "El horario regular debe tener inicio y término distintos.";
  if (!(input.overnightFlatAmount >= 0)) errors.overnightFlatAmount = "Ingresa el valor único nocturno en pesos.";
  input.blocks.forEach((block) => { if (!(block.amount >= 0)) errors[`block_amount_${block.sequence}`] = "Ingresa un valor válido."; });
  return errors;
}

export async function GET(request, { params }) {
  const actor = await authenticateRequest(request);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión.", code: "AUTH_REQUIRED" }, { status: 401 });
  try {
    const { id } = await params;
    const db = getSupabaseAdminClient();
    const parking = await getParking(db, id);
    if (!parking) return NextResponse.json({ error: "Estacionamiento no encontrado." }, { status: 404 });
    return NextResponse.json({ data: await listParkingRates(db, parking.id), parking });
  } catch (error) { return operationalError(error, "No fue posible obtener las tarifas."); }
}

export async function POST(request, { params }) {
  const actor = await authenticateRequest(request);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión.", code: "AUTH_REQUIRED" }, { status: 401 });
  if (!actor.isAdmin && !actor.isSupervisor) return NextResponse.json({ error: "No tienes permisos para crear tarifas.", code: "FORBIDDEN" }, { status: 403 });
  try {
    const { id } = await params;
    const db = getSupabaseAdminClient();
    const parking = await getParking(db, id);
    if (!parking) return NextResponse.json({ error: "Estacionamiento no encontrado." }, { status: 404 });
    const input = sanitize(await request.json());
    const errors = validate(input);
    if (Object.keys(errors).length) return validationError(errors);
    return NextResponse.json({ data: await createParkingRate(db, parking.id, input) }, { status: 201 });
  } catch (error) { return operationalError(error, "No fue posible crear la tarifa."); }
}
