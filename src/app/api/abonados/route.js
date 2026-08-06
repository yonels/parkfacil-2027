import { NextResponse } from "next/server";
import {
  buildAbonadoRowInput,
  buildCredencialRowInput,
  buildResponsableRowInput,
  buildVehiculoRowInput,
  sanitizeAbonadoInput,
  validateAbonadoInput,
} from "@/lib/abonados";
import { isSupabaseConfigurationError } from "@/lib/supabaseServer";
import { fetchAbonadosBundle, parseAbonadosListParams } from "@/lib/abonadosRepository";
import { authorizeSubscriberRequest, requireActiveClientCompany, requireSubscriberParkingId, subscriberAuthorizationError } from "@/lib/auth/subscriberAuthorization";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";

function jsonError(message, status = 500, details = null) {
  return NextResponse.json({ error: message, details }, { status });
}

function serializeErrorDetails(error) {
  return {
    message: error?.message || null,
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null,
    ...(process.env.NODE_ENV === "development" ? { stack: error?.stack || null } : {}),
  };
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

export async function GET(request) {
  try {
    const authorization = await authorizeSubscriberRequest(request, PERMISSIONS.SUBSCRIBERS_READ);
    if (authorization.response) return authorization.response;
    const { db: supabase, scope } = authorization;
    const params = parseAbonadosListParams(new URL(request.url).searchParams);
    const result = await fetchAbonadosBundle(supabase, params, scope);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);

    if (isSupabaseConfigurationError(error)) {
      return jsonError("Supabase no esta configurado en este entorno.", 503, serializeErrorDetails(error));
    }

    return jsonError("No fue posible obtener los abonados.", 500, serializeErrorDetails(error));
  }
}

export async function POST(request) {
  let authorization;
  try {
    authorization = await authorizeSubscriberRequest(request, PERMISSIONS.SUBSCRIBERS_MANAGE);
    if (authorization.response) return authorization.response;
    const raw = await request.json();
    const payload = sanitizeAbonadoInput(raw);
    if (authorization.context.role !== ROLES.PLATFORM_ADMIN) payload.empresaId = authorization.context.companyId;
    const validationErrors = validateAbonadoInput(payload);

    if (Object.keys(validationErrors).length > 0) {
      return jsonError("La informacion del abonado es invalida.", 400, validationErrors);
    }

    const { db: supabase, scope } = authorization;
    await requireActiveClientCompany(supabase, authorization.context, payload.empresaId);
    await requireSubscriberParkingId(supabase, authorization.context, payload.empresaId, payload.estacionamientoId);
    payload.responsableId = await resolveResponsableId(supabase, payload);

    const { data: insertedRows, error: insertError } = await supabase
      .from("abonados")
      .insert(buildAbonadoRowInput(payload))
      .select("*")
      .limit(1);

    if (insertError) {
      if (insertError.code === "23505") return jsonError("Ya existe un abonado con esos datos unicos.", 409);
      return jsonError("No fue posible crear el abonado.", 500);
    }

    const inserted = insertedRows?.[0];
    if (!inserted) return jsonError("No fue posible crear el abonado.", 500);

    const vehiculoInput = buildVehiculoRowInput(payload, inserted.id);
    let vehiculoId = null;
    if (vehiculoInput) {
      const { data: vehiculoRows, error: vehiculoError } = await supabase.from("abonado_vehiculos").insert(vehiculoInput).select("id").limit(1);
      vehiculoId = vehiculoRows?.[0]?.id || null;
      if (vehiculoError) {
        if (vehiculoError.code === "23505") return jsonError("Ya existe un vehiculo con esos datos unicos.", 409);
        return jsonError("No fue posible guardar el vehiculo principal.", 500);
      }
    }

    if (payload.credencialTipo === "qr_plate") payload.vehiculoId = vehiculoId;
    const credencialInput = buildCredencialRowInput(payload, inserted.id);
    if (credencialInput) {
      const { error: credencialError } = await supabase.from("abonado_credenciales").insert(credencialInput);
      if (credencialError) {
        if (credencialError.code === "23505") return jsonError("Ya existe una credencial con esos datos unicos.", 409);
        return jsonError("No fue posible guardar la credencial principal.", 500);
      }
    }

    const created = await fetchAbonadosBundle(supabase, { id: inserted.id }, scope);
    return NextResponse.json({ data: created.data?.[0] || null }, { status: 201 });
  } catch (error) {
    const denied = subscriberAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    if (isSupabaseConfigurationError(error)) return jsonError("Supabase no esta configurado en este entorno.", 503);
    if (error?.code === "23505") return jsonError("Ya existe un abonado, responsable, vehiculo o credencial con esos datos unicos.", 409);
    return jsonError("No fue posible crear el abonado.", 500);
  }
}



