import { NextResponse } from "next/server";
import {
  buildAbonadoRowInput,
  buildCredencialRowInput,
  buildResponsableRowInput,
  buildVehiculoRowInput,
  sanitizeAbonadoInput,
  validateAbonadoInput,
} from "@/lib/abonados";
import { getSupabaseAdminClient, isSupabaseConfigurationError } from "@/lib/supabaseServer";
import { fetchAbonadosBundle, parseAbonadosListParams } from "@/lib/abonadosRepository";

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
    const supabase = getSupabaseAdminClient();
    const params = parseAbonadosListParams(new URL(request.url).searchParams);
    const result = await fetchAbonadosBundle(supabase, params);
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
  try {
    const raw = await request.json();
    const payload = sanitizeAbonadoInput(raw);
    const validationErrors = validateAbonadoInput(payload);

    if (Object.keys(validationErrors).length > 0) {
      return jsonError("La informacion del abonado es invalida.", 400, validationErrors);
    }

    const supabase = getSupabaseAdminClient();
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

    const created = await fetchAbonadosBundle(supabase, { id: inserted.id });
    return NextResponse.json({ data: created.data?.[0] || null }, { status: 201 });
  } catch (error) {
    if (isSupabaseConfigurationError(error)) return jsonError("Supabase no esta configurado en este entorno.", 503);
    if (error?.code === "23505") return jsonError("Ya existe un abonado, responsable, vehiculo o credencial con esos datos unicos.", 409);
    return jsonError("No fue posible crear el abonado.", 500);
  }
}



