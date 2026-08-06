import { NextResponse } from "next/server";
import {
  buildAbonadoRowInput,
  buildCredencialRowInput,
  buildResponsableRowInput,
  buildVehiculoRowInput,
  mapDbRowsToAbonados,
  sanitizeAbonadoInput,
  validateAbonadoInput,
  isValidUuid,
} from "@/lib/abonados";
import { isSupabaseConfigurationError } from "@/lib/supabaseServer";
import { authorizeSubscriberRequest, requireSubscriber, requireSubscriberParkingId, subscriberAuthorizationError } from "@/lib/auth/subscriberAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

function jsonError(message, status = 500, details = null) {
  return NextResponse.json({ error: message, details }, { status });
}

async function fetchAbonadoById(supabase, id) {
  const { data: abonadoRows, error: abonadoError } = await supabase.from("abonados").select("*").eq("id", id).limit(1);
  if (abonadoError) throw abonadoError;
  if (!abonadoRows || abonadoRows.length === 0) return null;

  const responsableIds = abonadoRows.map((row) => row.responsable_id).filter(Boolean);
  const [vehiculosResult, credencialesResult, responsablesResult] = await Promise.all([
    supabase.from("abonado_vehiculos").select("*").eq("abonado_id", id).order("is_primary", { ascending: false }),
    supabase.from("abonado_credenciales").select("*").eq("abonado_id", id).order("created_at", { ascending: true }),
    responsableIds.length > 0 ? supabase.from("abonado_responsables").select("*").in("id", responsableIds) : Promise.resolve({ data: [], error: null }),
  ]);

  if (vehiculosResult.error) throw vehiculosResult.error;
  if (credencialesResult.error) throw credencialesResult.error;
  if (responsablesResult.error) throw responsablesResult.error;

  const list = mapDbRowsToAbonados(abonadoRows, vehiculosResult.data || [], credencialesResult.data || [], responsablesResult.data || []);
  return list[0] || null;
}

async function resolveResponsableId(supabase, payload) {
  if (!payload.responsableNuevo) return payload.responsableId;

  if (payload.responsableNuevo.id) {
    const { error } = await supabase
      .from("abonado_responsables")
      .update(buildResponsableRowInput(payload.responsableNuevo))
      .eq("id", payload.responsableNuevo.id);
    if (error) throw error;
    return payload.responsableNuevo.id;
  }

  const { data, error } = await supabase
    .from("abonado_responsables")
    .insert(buildResponsableRowInput(payload.responsableNuevo))
    .select("id")
    .limit(1);

  if (error) throw error;
  return data?.[0]?.id || payload.responsableId;
}

export async function GET(request, { params }) {
  let authorization;
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;

    if (!isValidUuid(id)) return jsonError("El identificador del abonado no es valido.", 400);

    authorization = await authorizeSubscriberRequest(request, PERMISSIONS.SUBSCRIBERS_READ);
    if (authorization.response) return authorization.response;
    const { db: supabase } = authorization;
    await requireSubscriber(supabase, authorization.context, authorization.scope, id);
    const abonado = await fetchAbonadoById(supabase, id);
    if (!abonado) return jsonError("Abonado no encontrado.", 404);

    return NextResponse.json({ data: abonado });
  } catch (error) {
    const denied = subscriberAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    if (isSupabaseConfigurationError(error)) return jsonError("Supabase no esta configurado en este entorno.", 503);
    return jsonError("No fue posible obtener el abonado.", 500);
  }
}

export async function PATCH(request, { params }) {
  let authorization;
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;

    if (!isValidUuid(id)) return jsonError("El identificador del abonado no es valido.", 400);

    authorization = await authorizeSubscriberRequest(request, PERMISSIONS.SUBSCRIBERS_MANAGE);
    if (authorization.response) return authorization.response;
    const existing = await requireSubscriber(authorization.db, authorization.context, authorization.scope, id);
    const raw = await request.json();
    const payload = sanitizeAbonadoInput(raw);
    payload.empresaId = existing.empresa_id;
    const validationErrors = validateAbonadoInput(payload);

    if (Object.keys(validationErrors).length > 0) {
      return jsonError("La informacion del abonado es invalida.", 400, validationErrors);
    }

    const supabase = authorization.db;
    await requireSubscriberParkingId(supabase, authorization.context, existing.empresa_id, payload.estacionamientoId);
    payload.responsableId = await resolveResponsableId(supabase, payload);

    const { data: updatedRows, error: updateError } = await supabase
      .from("abonados")
      .update(buildAbonadoRowInput(payload))
      .eq("id", id)
      .select("id")
      .limit(1);

    if (updateError) {
      if (updateError.code === "23505") return jsonError("Ya existe un abonado con esos datos unicos.", 409);
      return jsonError("No fue posible actualizar el abonado.", 500);
    }

    if (!updatedRows || updatedRows.length === 0) return jsonError("Abonado no encontrado.", 404);

    const [{ data: existingVehiculos }, { data: existingCredenciales }] = await Promise.all([
      supabase.from("abonado_vehiculos").select("id").eq("abonado_id", id).order("is_primary", { ascending: false }).limit(1),
      supabase.from("abonado_credenciales").select("id").eq("abonado_id", id).order("created_at", { ascending: true }).limit(1),
    ]);

    const vehiculoInput = buildVehiculoRowInput(payload, id, existingVehiculos?.[0]?.id || null);
    let vehiculoId = existingVehiculos?.[0]?.id || null;
    if (vehiculoInput) {
      const { data: vehiculoRows, error: vehiculoUpsertError } = await supabase.from("abonado_vehiculos").upsert(vehiculoInput).select("id").limit(1);
      vehiculoId = vehiculoRows?.[0]?.id || vehiculoId;
      if (vehiculoUpsertError) {
        if (vehiculoUpsertError.code === "23505") return jsonError("Ya existe un vehiculo con esos datos unicos.", 409);
        return jsonError("No fue posible actualizar el vehiculo principal.", 500);
      }
    }

    if (payload.credencialTipo === "qr_plate") payload.vehiculoId = vehiculoId;
    const credencialInput = buildCredencialRowInput(payload, id, existingCredenciales?.[0]?.id || null);
    if (credencialInput) {
      const { error: credencialUpsertError } = await supabase.from("abonado_credenciales").upsert(credencialInput);
      if (credencialUpsertError) {
        if (credencialUpsertError.code === "23505") return jsonError("Ya existe una credencial con esos datos unicos.", 409);
        return jsonError("No fue posible actualizar la credencial principal.", 500);
      }
    }

    const updated = await fetchAbonadoById(supabase, id);
    return NextResponse.json({ data: updated });
  } catch (error) {
    const denied = subscriberAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    if (isSupabaseConfigurationError(error)) return jsonError("Supabase no esta configurado en este entorno.", 503);
    if (error?.code === "23505") return jsonError("Ya existe un abonado, responsable, vehiculo o credencial con esos datos unicos.", 409);
    return jsonError("No fue posible actualizar el abonado.", 500);
  }
}

export async function PUT(request, context) {
  return PATCH(request, context);
}


