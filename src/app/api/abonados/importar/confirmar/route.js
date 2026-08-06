import { NextResponse } from "next/server";
import {
  buildAbonadoRowInput,
  buildCredencialRowInput,
  buildVehiculoRowInput,
  sanitizeAbonadoInput,
  validateAbonadoInput,
} from "@/lib/abonados";
import { applySubscriberScope, authorizeSubscriberRequest, requireActiveClientCompany, requireSubscriberParkingId } from "@/lib/auth/subscriberAuthorization";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";

function jsonError(message, status = 400, details = null) {
  return NextResponse.json({ error: message, details }, { status });
}

async function findExisting(supabase, row, scope) {
  if (row.id) {
    const { data } = await applySubscriberScope(supabase.from("abonados").select("id"), scope).eq("id", row.id).limit(1);
    if (data?.[0]) return data[0].id;
  }
  if (row.codigo) {
    const { data } = await applySubscriberScope(supabase.from("abonados").select("id"), scope).eq("codigo", row.codigo).limit(1);
    if (data?.[0]) return data[0].id;
  }
  if (row.rutNormalizado) {
    const { data } = await applySubscriberScope(supabase.from("abonados").select("id"), scope).eq("rut", row.rutNormalizado).limit(1);
    if (data?.[0]) return data[0].id;
  }
  return null;
}

export async function POST(request) {
  try {
    const authorization = await authorizeSubscriberRequest(request, PERMISSIONS.SUBSCRIBERS_MANAGE);
    if (authorization.response) return authorization.response;
    const body = await request.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const { db: supabase, scope } = authorization;
    const results = [];

    for (const row of rows) {
      if (row.status !== "valid") {
        results.push({ row: row.row, status: "Omitido", message: "Fila omitida por errores de validacion." });
        continue;
      }

      const rawPayload = { ...(row.payload || {}) };
      if (rawPayload.credencialNumero === "IMPORT-PREVIEW") rawPayload.credencialNumero = "";
      const payload = sanitizeAbonadoInput(rawPayload);
      if (authorization.context.role !== ROLES.PLATFORM_ADMIN) payload.empresaId = authorization.context.companyId;
      const errors = validateAbonadoInput(payload);
      if (Object.keys(errors).length > 0) {
        results.push({ row: row.row, status: "Error", message: "La fila no cumple las validaciones del servidor.", details: errors });
        continue;
      }

      await requireActiveClientCompany(supabase, authorization.context, payload.empresaId);
      await requireSubscriberParkingId(supabase, authorization.context, payload.empresaId, payload.estacionamientoId);
      const existingId = await findExisting(supabase, { id: row.payload?.id, codigo: payload.codigo, rutNormalizado: payload.rutNormalizado }, scope);
      if (existingId) {
        const { error } = await supabase.from("abonados").update(buildAbonadoRowInput(payload)).eq("id", existingId);
        if (error) {
          results.push({ row: row.row, status: "Error", message: "No fue posible actualizar el abonado." });
        } else {
          results.push({ row: row.row, id: existingId, status: "Actualizado", message: "Abonado actualizado." });
        }
        continue;
      }

      const { data: insertedRows, error: insertError } = await supabase.from("abonados").insert(buildAbonadoRowInput(payload)).select("id").limit(1);
      if (insertError || !insertedRows?.[0]) {
        results.push({ row: row.row, status: "Error", message: "No fue posible crear el abonado." });
        continue;
      }

      const abonadoId = insertedRows[0].id;
      const vehiculoInput = buildVehiculoRowInput(payload, abonadoId);
      if (vehiculoInput) await supabase.from("abonado_vehiculos").insert(vehiculoInput);
      const credencialInput = buildCredencialRowInput(payload, abonadoId);
      if (credencialInput) await supabase.from("abonado_credenciales").insert(credencialInput);
      results.push({ row: row.row, id: abonadoId, status: "Creado", message: "Abonado creado." });
    }

    return NextResponse.json({
      total: results.length,
      created: results.filter((item) => item.status === "Creado").length,
      updated: results.filter((item) => item.status === "Actualizado").length,
      skipped: results.filter((item) => item.status === "Omitido").length,
      errors: results.filter((item) => item.status === "Error").length,
      results,
    });
  } catch {
    return jsonError("No fue posible confirmar la importacion.", 500);
  }
}

