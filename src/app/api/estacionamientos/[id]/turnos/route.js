import { NextResponse } from "next/server";
import { operationalError, validationError } from "@/lib/parkingApi";
import { canOpenShift, SHIFT_STATES } from "@/lib/parkingOperations.mjs";
import { authorizeOperationRequest, operationAuthorizationError, requireOperationalParking } from "@/lib/auth/operationAuthorization";
import { requireOperatorForParking, requireParkingChild, requireSupervisorForParking } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";

const OFF_STREET_SECTOR_CODE = "O";
const OFF_STREET_SECTOR_NAME = "Operación Off Street";
const OFF_STREET_STREET_NAME = "Operación general";

async function ensureOffStreetAssignment(db, parking, operatorId) {
  let sector = null;
  const sectorResult = await db
    .from("parking_sectors")
    .select("id")
    .eq("parking_id", parking.id)
    .eq("code", OFF_STREET_SECTOR_CODE)
    .maybeSingle();
  if (sectorResult.error) throw sectorResult.error;
  sector = sectorResult.data;
  if (!sector) {
    const createSector = await db
      .from("parking_sectors")
      .insert({
        parking_id: parking.id,
        code: OFF_STREET_SECTOR_CODE,
        name: OFF_STREET_SECTOR_NAME,
        type: "OFF_STREET",
        status: "ACTIVE",
        capacity: 1,
        occupied: 0,
        level: "NIV-OPS",
        zone: "ZON-OPS",
        location_description: "Asignación operativa base para turnos Off Street.",
        notes: "AUTO_GENERATED_OFF_STREET_OPERATION",
      })
      .select("id")
      .single();
    if (createSector.error) throw createSector.error;
    sector = createSector.data;
  }

  let street = null;
  const streetResult = await db
    .from("parking_streets")
    .select("id")
    .eq("parking_id", parking.id)
    .eq("sector_id", sector.id)
    .eq("name", OFF_STREET_STREET_NAME)
    .maybeSingle();
  if (streetResult.error) throw streetResult.error;
  street = streetResult.data;
  if (!street) {
    const createStreet = await db
      .from("parking_streets")
      .insert({
        parking_id: parking.id,
        sector_id: sector.id,
        name: OFF_STREET_STREET_NAME,
        district: "OFF_STREET",
        status: "ACTIVE",
        capacity: 1,
        occupied: 0,
        notes: "AUTO_GENERATED_OFF_STREET_OPERATION",
      })
      .select("id")
      .single();
    if (createStreet.error) throw createStreet.error;
    street = createStreet.data;
  }

  const today = new Date().toISOString().slice(0, 10);
  const assignmentResult = await db
    .from("operator_assignments")
    .select("*")
    .eq("parking_id", parking.id)
    .eq("sector_id", sector.id)
    .eq("street_id", street.id)
    .eq("operator_id", operatorId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (assignmentResult.error) throw assignmentResult.error;
  if (assignmentResult.data) return assignmentResult.data;

  const createdAssignment = await db
    .from("operator_assignments")
    .insert({
      operator_id: operatorId,
      parking_id: parking.id,
      sector_id: sector.id,
      street_id: street.id,
      number_from: 1,
      number_to: 2,
      max_vehicles: 1,
      valid_from: today,
      valid_until: null,
      start_time: "00:00",
      end_time: "23:59",
      days_of_week: [1, 2, 3, 4, 5, 6, 7],
      status: "ACTIVE",
      supervisor_id: null,
      notes: "AUTO_GENERATED_OFF_STREET_OPERATION",
    })
    .select("*")
    .single();
  if (createdAssignment.error) throw createdAssignment.error;
  return createdAssignment.data;
}

export async function GET(request, { params }) {
  let authorization;
  try {
    const { id } = await params;
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;
    const parking = await requireOperationalParking(authorization.db, authorization.context, authorization.scope, id);
    let query = authorization.db.from("operator_shifts").select("*").eq("parking_id", parking.id).order("shift_date", { ascending: false });
    if (authorization.context.role === ROLES.OPERATOR) query = query.eq("operator_id", authorization.context.userId);
    const result = await query;
    if (result.error) throw result.error;
    return NextResponse.json({ data: result.data });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    return denied || operationalError(error, undefined, request, authorization?.context);
  }
}

export async function POST(request, { params }) {
  let authorization;
  try {
    const { id } = await params;
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;
    const input = await request.json();
    const { db, context } = authorization;
    const parking = await requireOperationalParking(db, context, authorization.scope, id);

    const errors = {};
    if (!input.operatorId) errors.operatorId = "Selecciona un operador.";
    if (parking.type !== "OFF_STREET" && !input.assignmentId) errors.assignmentId = "Selecciona una asignacion.";
    if (!input.date) errors.date = "La fecha es obligatoria.";
    if (!SHIFT_STATES.includes(input.status || "PROGRAMMED")) errors.status = "Estado invalido.";
    if (Object.keys(errors).length) return validationError(errors);

    if (context.role === ROLES.OPERATOR && input.operatorId !== context.userId) throw new AuthorizationError("PERMISSION_FORBIDDEN", 403, "No tienes permiso para crear turnos para otro operador.", context);
    await requireOperatorForParking(db, context, parking, input.operatorId);

    let assignment = null;
    if (input.assignmentId) {
      assignment = await requireParkingChild(db, context, parking, "operator_assignments", input.assignmentId);
      if (assignment.operator_id !== input.operatorId) throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontro la asignacion solicitada.", context);
      if (input.sectorId) await requireParkingChild(db, context, parking, "parking_sectors", input.sectorId);
      if (input.streetId) await requireParkingChild(db, context, parking, "parking_streets", input.streetId, input.sectorId ? { sector_id: input.sectorId } : {});
    } else if (parking.type === "OFF_STREET") {
      assignment = await ensureOffStreetAssignment(db, parking, input.operatorId);
    }

    if (!assignment) {
      throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontro una asignacion operativa para este turno.", context);
    }

    if (input.supervisorId) await requireSupervisorForParking(db, context, parking, input.supervisorId);
    const open = await db.from("operator_shifts").select("operator_id,status").eq("operator_id", input.operatorId).in("status", ["OPEN", "CLOSING"]);
    if (open.error) throw open.error;
    if (!canOpenShift((open.data || []).map((item) => ({ operatorId: item.operator_id, status: item.status })), input.operatorId)) return NextResponse.json({ error: "El operador ya tiene un turno abierto.", code: "OPERATOR_SHIFT_CONFLICT" }, { status: 409 });
    const row = {
      operator_id: input.operatorId,
      parking_id: parking.id,
      sector_id: assignment.sector_id,
      street_id: assignment.street_id,
      assignment_id: assignment.id,
      shift_date: input.date,
      scheduled_start: input.scheduledStart || "00:00",
      scheduled_end: input.scheduledEnd || "23:59",
      status: input.status || "PROGRAMMED",
      device_id: input.deviceId || null,
      supervisor_id: input.supervisorId || null,
      notes: input.notes || "",
    };
    const result = await db.from("operator_shifts").insert(row).select("*").single();
    if (result.error) throw result.error;
    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    return denied || operationalError(error, "No fue posible crear el turno.", request, authorization?.context);
  }
}
