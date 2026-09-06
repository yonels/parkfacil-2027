// Sin "import server-only" a propósito (mismo criterio documentado en
// posStaysService.js): este módulo solo recibe un cliente `db` ya creado
// por el llamador (siempre server-side, vía getSupabaseAdminClient) y así
// queda unit-testeable con un db falso en memoria, sin depender del bundler
// de Next para resolver el paquete "server-only" (ver
// offStreetPlatePhotoSettingsRepository.test.mjs).
import { DEFAULT_PLATE_PHOTO_SETTINGS, isValidPlatePhotoMode, isValidRetentionDays } from "./offStreetPlatePhoto.mjs";

// Configuración Off Street de "fotografía de patente en ENTRY", una fila por
// estacionamiento (ver migración 20260905130000_off_street_plate_photo.sql).
// Sin fila todavía == DISABLED (comportamiento actual intacto, §12 del
// encargo) — nunca se asume REQUIRED/OPTIONAL por ausencia de configuración.

function mapRow(row) {
  if (!row) return { ...DEFAULT_PLATE_PHOTO_SETTINGS };
  return {
    plateMode: row.plate_photo_mode,
    printOnTicket: Boolean(row.print_plate_photo_on_ticket),
    evidenceRetentionDays: row.evidence_retention_days ?? null,
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
  };
}

export async function getPlatePhotoSettings(db, parkingId) {
  if (!parkingId) return { ...DEFAULT_PLATE_PHOTO_SETTINGS };
  const { data, error } = await db
    .from("parking_offstreet_settings")
    .select("parking_id,plate_photo_mode,print_plate_photo_on_ticket,evidence_retention_days,updated_at,updated_by")
    .eq("parking_id", parkingId)
    .maybeSingle();
  if (error) throw error;
  return mapRow(data);
}

export async function setPlatePhotoSettings(db, { parkingId, companyId, plateMode, printOnTicket, evidenceRetentionDays, updatedBy }) {
  if (!parkingId || !companyId) {
    throw Object.assign(new Error("PLATE_PHOTO_SETTINGS_MISSING_SCOPE"), { code: "PLATE_PHOTO_SETTINGS_MISSING_SCOPE", status: 400 });
  }
  if (!isValidPlatePhotoMode(plateMode)) {
    throw Object.assign(new Error("PLATE_PHOTO_MODE_INVALID"), { code: "PLATE_PHOTO_MODE_INVALID", status: 400 });
  }
  if (!isValidRetentionDays(evidenceRetentionDays)) {
    throw Object.assign(new Error("PLATE_PHOTO_RETENTION_INVALID"), { code: "PLATE_PHOTO_RETENTION_INVALID", status: 400 });
  }
  const row = {
    parking_id: parkingId,
    company_id: companyId,
    plate_photo_mode: plateMode,
    print_plate_photo_on_ticket: Boolean(printOnTicket),
    evidence_retention_days: evidenceRetentionDays ?? null,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy || null,
  };
  const { data, error } = await db
    .from("parking_offstreet_settings")
    .upsert(row, { onConflict: "parking_id" })
    .select("parking_id,plate_photo_mode,print_plate_photo_on_ticket,evidence_retention_days,updated_at,updated_by")
    .single();
  if (error) throw error;
  return mapRow(data);
}
