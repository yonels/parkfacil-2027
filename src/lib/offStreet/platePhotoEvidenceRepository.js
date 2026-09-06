// Sin "import server-only" a propósito -- mismo criterio que
// offStreetPlatePhotoSettingsRepository.js (ver comentario ahí): recibe un
// `db` ya creado por el llamador, así queda testeable con un db falso.
import { createHash } from "node:crypto";
import { DEFAULT_EVIDENCE_TYPE, PLATE_PHOTO_ALLOWED_MIME, PLATE_PHOTO_MAX_BYTES, isValidEvidenceType, validatePlatePhotoFile } from "./offStreetPlatePhoto.mjs";

// Evidencia fotográfica de patente en ENTRY (Off Street, Fase 6). Mismo
// patrón que src/lib/inspector/inspectorEvidenceRepository.js: bucket
// PRIVADO (ver migración 20260905130000), nunca URL pública — toda lectura
// pasa por createSignedUrl generada aquí, server-side.
export const PLATE_PHOTO_BUCKET = "off-street-plate-photos";
export const PLATE_PHOTO_EVIDENCE_TYPE = "PLATE_ENTRY_PHOTO";

const EXT_BY_MIME = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// null/undefined/"" tratados como AUSENTES (nunca como 0): Number(null) es
// 0 y Number.isFinite(0) es true, así que un chequeo ingenuo guardaría 0,0
// como coordenada real para "sin GPS" -- el mismo tipo de bug ya corregido
// una vez en este proyecto para numeroSeguro (ver esa función). GPS ausente
// debe quedar NULL, nunca (0, 0) -- eso sí sería un dato inventado.
function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Metadatos de trazabilidad, ya seleccionados en toda lectura de evidencia
// (§16 del ajuste final): captured_at/GPS/dispositivo/hash/tipo. operator_id
// y ticket-estadía NO se duplican acá -- ya son created_by/parking_stay_id
// (columnas existentes desde 6A); el nombre del operador tampoco se guarda
// en esta tabla -- se reutiliza parking_stays.entry_operator_name, ya
// denormalizado ahí para el mismo ENTRY (relación 1:1 real).
const EVIDENCE_SELECT_FIELDS =
  "id,storage_path,mime_type,size_bytes,created_at,created_by,captured_at,latitude,longitude,gps_accuracy_m,device_info,evidence_type,sha256";

// Orden exigido por el encargo (§7): la fotografía se sube ANTES de crear la
// permanencia (parking_stays) -- así, si el upload falla en modo REQUIRED,
// nunca se llega a crear un ingreso a medias. El path todavía no referencia
// ningún parking_stay_id (no existe aún); la fila de metadata que sí lo
// referencia se inserta después, una vez creada la permanencia
// (ver linkPlateEntryPhoto). El hash SHA-256 (§22 del ajuste final) se
// calcula acá, sobre los MISMOS bytes que se suben al bucket -- nunca sobre
// una copia distinta ni después de una transformación posterior (nunca se
// modifica la imagen original tras calcular su hash).
export async function uploadPlateEntryPhoto(db, { parkingId, buffer, mimeType, sizeBytes }) {
  const validation = validatePlatePhotoFile({ mimeType, sizeBytes });
  if (!validation.valid) {
    throw Object.assign(new Error(validation.code), { code: validation.code, status: 400 });
  }
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const path = `${parkingId}/${crypto.randomUUID()}.${EXT_BY_MIME[mimeType]}`;
  const upload = await db.storage.from(PLATE_PHOTO_BUCKET).upload(path, buffer, { contentType: mimeType, upsert: false });
  if (upload.error) {
    throw Object.assign(new Error("PLATE_PHOTO_UPLOAD_FAILED"), { code: "PLATE_PHOTO_UPLOAD_FAILED", status: 503, cause: upload.error });
  }
  return { storagePath: path, mimeType, sizeBytes, sha256 };
}

// Best-effort: nunca debe dejar un objeto huérfano en el bucket cuando la
// permanencia no llegó a crearse o la metadata no llegó a insertarse (§7,
// "No dejar fotografías huérfanas"). No lanza -- quien compensa ya está
// reportando el error real al llamador original.
export async function removeOrphanedPlatePhoto(db, storagePath) {
  if (!storagePath) return;
  await db.storage.from(PLATE_PHOTO_BUCKET).remove([storagePath]).catch(() => {});
}

// Inserta la fila de metadata una vez que la permanencia YA existe. Si esto
// falla, el llamador decide: la permanencia real ya quedó creada (evento de
// negocio genuino), así que aquí solo se compensa el archivo del bucket —
// nunca se borra la permanencia por un fallo de metadata (ver nota en
// route.js).
//
// capturedAt/latitude/longitude/gpsAccuracyM/deviceInfo son opcionales (§18:
// GPS puede estar DISABLED/no disponible; nunca se inventa un valor cuando
// no existe -- se guarda tal cual null). evidenceType por defecto
// PHOTO_CAPTURED (§21: nunca se marca un render como foto real sin que el
// llamador lo declare explícitamente).
export async function linkPlateEntryPhoto(db, {
  companyId,
  parkingId,
  parkingStayId,
  storagePath,
  mimeType,
  sizeBytes,
  createdBy,
  capturedAt = null,
  latitude = null,
  longitude = null,
  gpsAccuracyM = null,
  deviceInfo = null,
  evidenceType = DEFAULT_EVIDENCE_TYPE,
  sha256 = null,
}) {
  const resolvedEvidenceType = isValidEvidenceType(evidenceType) ? evidenceType : DEFAULT_EVIDENCE_TYPE;
  const inserted = await db
    .from("parking_stay_evidence")
    .insert({
      company_id: companyId,
      parking_id: parkingId,
      parking_stay_id: parkingStayId,
      type: PLATE_PHOTO_EVIDENCE_TYPE,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      created_by: createdBy || null,
      captured_at: capturedAt || null,
      latitude: toFiniteNumberOrNull(latitude),
      longitude: toFiniteNumberOrNull(longitude),
      gps_accuracy_m: toFiniteNumberOrNull(gpsAccuracyM),
      device_info: deviceInfo || null,
      evidence_type: resolvedEvidenceType,
      sha256: sha256 || null,
    })
    .select(EVIDENCE_SELECT_FIELDS)
    .single();
  if (inserted.error) {
    await removeOrphanedPlatePhoto(db, storagePath);
    throw Object.assign(new Error("PLATE_PHOTO_LINK_FAILED"), { code: "PLATE_PHOTO_LINK_FAILED", status: 503, cause: inserted.error });
  }
  return mapEvidenceRow(inserted.data);
}

function mapEvidenceRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    operatorId: row.created_by || null,
    capturedAt: row.captured_at || null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    gpsAccuracyM: row.gps_accuracy_m ?? null,
    deviceInfo: row.device_info || null,
    evidenceType: row.evidence_type || DEFAULT_EVIDENCE_TYPE,
    sha256: row.sha256 || null,
  };
}

export async function getPlateEntryPhotoByStay(db, parkingStayId) {
  const { data, error } = await db
    .from("parking_stay_evidence")
    .select(EVIDENCE_SELECT_FIELDS)
    .eq("parking_stay_id", parkingStayId)
    .eq("type", PLATE_PHOTO_EVIDENCE_TYPE)
    .maybeSingle();
  if (error) throw error;
  return mapEvidenceRow(data);
}

export async function getPlateEntryPhotoSignedUrl(db, parkingStayId, expiresInSeconds = 120) {
  const row = await getPlateEntryPhotoByStay(db, parkingStayId);
  if (!row) return null;
  const signed = await db.storage.from(PLATE_PHOTO_BUCKET).createSignedUrl(row.storagePath, expiresInSeconds);
  if (signed.error) return null;
  return { ...row, url: signed.data?.signedUrl || null };
}

export { PLATE_PHOTO_ALLOWED_MIME, PLATE_PHOTO_MAX_BYTES };
