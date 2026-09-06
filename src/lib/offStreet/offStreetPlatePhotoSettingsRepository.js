// Sin "import server-only" a propósito (mismo criterio documentado en
// posStaysService.js): este módulo solo recibe un cliente `db` ya creado
// por el llamador (siempre server-side, vía getSupabaseAdminClient) y así
// queda unit-testeable con un db falso en memoria, sin depender del bundler
// de Next para resolver el paquete "server-only" (ver
// offStreetPlatePhotoSettingsRepository.test.mjs).
import { DEFAULT_PLATE_PHOTO_SETTINGS, isValidGpsMode, isValidPlatePhotoMode, isValidRetentionDays } from "./offStreetPlatePhoto.mjs";

// Configuración Off Street de "fotografía de patente en ENTRY", una fila por
// estacionamiento (ver migración 20260905130000_off_street_plate_photo.sql,
// extendida por 20260906170000_off_street_plate_photo_gps_metadata.sql con
// gps_mode). Sin fila todavía == DISABLED (comportamiento actual intacto,
// §12 del encargo) — nunca se asume REQUIRED/OPTIONAL por ausencia de
// configuración.

const SELECT_FIELDS = "parking_id,plate_photo_mode,print_plate_photo_on_ticket,gps_mode,evidence_retention_days,updated_at,updated_by";
// Fallback si la migración de GPS (20260906170000) todavía no se aplicó en
// este ambiente -- mismo criterio "migración pendiente nunca rompe la
// función" ya usado en otras piezas de este repo (ver p. ej. el fallback de
// numero_soporte en /api/soporte). Sin la columna, GPS simplemente se
// comporta como DISABLED (nunca se asume soporte que la base no tiene).
const SELECT_FIELDS_LEGACY = "parking_id,plate_photo_mode,print_plate_photo_on_ticket,evidence_retention_days,updated_at,updated_by";

function isMissingColumnError(error) {
  return ["42703", "PGRST204", "PGRST205"].includes(error?.code);
}

function mapRow(row) {
  if (!row) return { ...DEFAULT_PLATE_PHOTO_SETTINGS };
  return {
    plateMode: row.plate_photo_mode,
    printOnTicket: Boolean(row.print_plate_photo_on_ticket),
    // "gps_mode" ausente (columna no seleccionada por el fallback legacy, o
    // fila creada antes de que existiera la columna) -> DISABLED, nunca se
    // asume otra cosa.
    gpsMode: row.gps_mode ?? "DISABLED",
    evidenceRetentionDays: row.evidence_retention_days ?? null,
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
  };
}

export async function getPlatePhotoSettings(db, parkingId) {
  if (!parkingId) return { ...DEFAULT_PLATE_PHOTO_SETTINGS };
  let { data, error } = await db
    .from("parking_offstreet_settings")
    .select(SELECT_FIELDS)
    .eq("parking_id", parkingId)
    .maybeSingle();
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await db
      .from("parking_offstreet_settings")
      .select(SELECT_FIELDS_LEGACY)
      .eq("parking_id", parkingId)
      .maybeSingle());
  }
  if (error) throw error;
  return mapRow(data);
}

export async function setPlatePhotoSettings(db, { parkingId, companyId, plateMode, printOnTicket, gpsMode, evidenceRetentionDays, updatedBy }) {
  if (!parkingId || !companyId) {
    throw Object.assign(new Error("PLATE_PHOTO_SETTINGS_MISSING_SCOPE"), { code: "PLATE_PHOTO_SETTINGS_MISSING_SCOPE", status: 400 });
  }
  if (!isValidPlatePhotoMode(plateMode)) {
    throw Object.assign(new Error("PLATE_PHOTO_MODE_INVALID"), { code: "PLATE_PHOTO_MODE_INVALID", status: 400 });
  }
  // Ajuste final, §5 del encargo -- dependencia estricta entre opciones:
  // "GPS asociado a evidencia" no tiene sentido si la fotografía está
  // desactivada (no hay evidencia a la que asociarle nada). Se aplica acá
  // (no solo en la UI) para que la regla se cumpla sin importar qué haya
  // llegado en la petición -- nunca queda una configuración inconsistente
  // guardada por saltarse el formulario.
  const resolvedGpsMode = plateMode === "DISABLED" ? "DISABLED" : (gpsMode ?? "DISABLED");
  if (!isValidGpsMode(resolvedGpsMode)) {
    throw Object.assign(new Error("PLATE_PHOTO_GPS_MODE_INVALID"), { code: "PLATE_PHOTO_GPS_MODE_INVALID", status: 400 });
  }
  if (!isValidRetentionDays(evidenceRetentionDays)) {
    throw Object.assign(new Error("PLATE_PHOTO_RETENTION_INVALID"), { code: "PLATE_PHOTO_RETENTION_INVALID", status: 400 });
  }
  const row = {
    parking_id: parkingId,
    company_id: companyId,
    plate_photo_mode: plateMode,
    print_plate_photo_on_ticket: Boolean(printOnTicket),
    gps_mode: resolvedGpsMode,
    evidence_retention_days: evidenceRetentionDays ?? null,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy || null,
  };
  let { data, error } = await db
    .from("parking_offstreet_settings")
    .upsert(row, { onConflict: "parking_id" })
    .select(SELECT_FIELDS)
    .single();
  if (error && isMissingColumnError(error)) {
    // Migración de GPS aún no aplicada: se guarda el resto de la
    // configuración igual (comportamiento previo intacto) -- gps_mode
    // simplemente no puede persistirse todavía, nunca se rompe el guardado
    // completo por esto.
    const { gps_mode: _omitted, ...legacyRow } = row;
    ({ data, error } = await db
      .from("parking_offstreet_settings")
      .upsert(legacyRow, { onConflict: "parking_id" })
      .select(SELECT_FIELDS_LEGACY)
      .single());
  }
  if (error) throw error;
  return mapRow(data);
}
