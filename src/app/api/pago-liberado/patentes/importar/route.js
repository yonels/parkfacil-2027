import { NextResponse } from "next/server";
import { importRowToInput, MAX_IMPORT_ROWS, releasedPlateFromDb, validateReleasedPlateInput } from "@/lib/releasedPlates/releasedPlateCore.mjs";
import { authorizeReleasedPlates, fail, rpcErrorCode, rpcFailure } from "@/lib/releasedPlates/releasedPlateServer";

// Pago liberado gestionado por el cliente (SOL-2026-10-28-003): carga
// masiva desde Excel. `dryRun: true` valida fila por fila (formato, patente
// repetida en el archivo y autorización vigente o programada existente); sin
// dryRun crea solo las filas válidas, cada una con su propia RPC.

export const dynamic = "force-dynamic";

export async function POST(request) {
  const auth = await authorizeReleasedPlates(request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body.rows) ? body.rows.filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim())) : null;
  if (!rows || !rows.length) return fail("El archivo no tiene filas para importar.", 400);
  if (rows.length > MAX_IMPORT_ROWS) return fail(`Máximo ${MAX_IMPORT_ROWS} filas por archivo.`, 400);

  const { data: active, error } = await auth.db.from("released_plate_authorizations")
    .select("license_plate,valid_to,max_uses,uses_count").eq("company_id", auth.actor.companyId).eq("status", "ACTIVE").gt("valid_to", new Date().toISOString());
  if (error) return rpcFailure(error, "No fue posible validar el archivo.");
  const busy = new Set((active || []).filter((row) => row.max_uses === null || row.uses_count < row.max_uses).map((row) => row.license_plate));

  const seen = new Set();
  const results = rows.map((row, index) => {
    const validation = validateReleasedPlateInput(importRowToInput(row));
    const plate = validation.row?.license_plate || String(row[0] ?? "").trim().toUpperCase();
    let errorMessage = validation.ok ? null : validation.errors[0];
    if (!errorMessage && seen.has(plate)) errorMessage = "Patente repetida en el archivo.";
    if (!errorMessage && busy.has(plate)) errorMessage = "La patente ya tiene una autorización vigente o programada.";
    if (validation.ok) seen.add(plate);
    return { line: index + 2, plate, row: validation.row || null, error: errorMessage };
  });

  if (body.dryRun === true) {
    return NextResponse.json({ data: { results: results.map(({ line, plate, row, error: message }) => ({ line, plate, validFrom: row?.valid_from || null, validTo: row?.valid_to || null, rut: row?.beneficiary_rut || null, error: message })) } });
  }

  const created = [];
  for (const item of results) {
    if (item.error) continue;
    const saved = await auth.db.rpc("released_plate_save", {
      p_actor_id: auth.actor.id, p_company_id: auth.actor.companyId, p_authorization_id: null,
      p_expected_updated_at: null, p_input: item.row, p_imported: true,
    });
    if (saved.error) {
      const code = rpcErrorCode(saved.error);
      if (code === "RELEASED_PLATE_FORBIDDEN") return rpcFailure(saved.error, "No fue posible importar.");
      item.error = code === "RELEASED_PLATE_OVERLAP" ? "La patente ya tiene una autorización vigente o programada." : "No fue posible guardar la fila.";
      continue;
    }
    created.push(releasedPlateFromDb(saved.data));
  }
  return NextResponse.json({
    data: { created: created.length, rejected: results.filter((item) => item.error).map(({ line, plate, error: message }) => ({ line, plate, error: message })) },
  }, { status: 201 });
}
