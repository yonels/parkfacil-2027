// Sin "import server-only" a propósito -- mismo criterio que
// offStreetPlatePhotoSettingsRepository.js (ver comentario ahí): recibe un
// `db` ya creado por el llamador, así queda testeable con un db falso.
import { PLATE_PHOTO_ALLOWED_MIME, PLATE_PHOTO_MAX_BYTES, validatePlatePhotoFile } from "./offStreetPlatePhoto.mjs";

// Evidencia fotográfica de patente en ENTRY (Off Street, Fase 6). Mismo
// patrón que src/lib/inspector/inspectorEvidenceRepository.js: bucket
// PRIVADO (ver migración 20260905130000), nunca URL pública — toda lectura
// pasa por createSignedUrl generada aquí, server-side.
export const PLATE_PHOTO_BUCKET = "off-street-plate-photos";
export const PLATE_PHOTO_EVIDENCE_TYPE = "PLATE_ENTRY_PHOTO";

const EXT_BY_MIME = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Orden exigido por el encargo (§7): la fotografía se sube ANTES de crear la
// permanencia (parking_stays) -- así, si el upload falla en modo REQUIRED,
// nunca se llega a crear un ingreso a medias. El path todavía no referencia
// ningún parking_stay_id (no existe aún); la fila de metadata que sí lo
// referencia se inserta después, una vez creada la permanencia
// (ver linkPlateEntryPhoto).
export async function uploadPlateEntryPhoto(db, { parkingId, buffer, mimeType, sizeBytes }) {
  const validation = validatePlatePhotoFile({ mimeType, sizeBytes });
  if (!validation.valid) {
    throw Object.assign(new Error(validation.code), { code: validation.code, status: 400 });
  }
  const path = `${parkingId}/${crypto.randomUUID()}.${EXT_BY_MIME[mimeType]}`;
  const upload = await db.storage.from(PLATE_PHOTO_BUCKET).upload(path, buffer, { contentType: mimeType, upsert: false });
  if (upload.error) {
    throw Object.assign(new Error("PLATE_PHOTO_UPLOAD_FAILED"), { code: "PLATE_PHOTO_UPLOAD_FAILED", status: 503, cause: upload.error });
  }
  return { storagePath: path, mimeType, sizeBytes };
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
export async function linkPlateEntryPhoto(db, { companyId, parkingId, parkingStayId, storagePath, mimeType, sizeBytes, createdBy }) {
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
    })
    .select("id,storage_path,mime_type,size_bytes,created_at")
    .single();
  if (inserted.error) {
    await removeOrphanedPlatePhoto(db, storagePath);
    throw Object.assign(new Error("PLATE_PHOTO_LINK_FAILED"), { code: "PLATE_PHOTO_LINK_FAILED", status: 503, cause: inserted.error });
  }
  return inserted.data;
}

export async function getPlateEntryPhotoByStay(db, parkingStayId) {
  const { data, error } = await db
    .from("parking_stay_evidence")
    .select("id,storage_path,mime_type,size_bytes,created_at")
    .eq("parking_stay_id", parkingStayId)
    .eq("type", PLATE_PHOTO_EVIDENCE_TYPE)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getPlateEntryPhotoSignedUrl(db, parkingStayId, expiresInSeconds = 120) {
  const row = await getPlateEntryPhotoByStay(db, parkingStayId);
  if (!row) return null;
  const signed = await db.storage.from(PLATE_PHOTO_BUCKET).createSignedUrl(row.storage_path, expiresInSeconds);
  if (signed.error) return null;
  return { id: row.id, mimeType: row.mime_type, sizeBytes: row.size_bytes, createdAt: row.created_at, url: signed.data?.signedUrl || null };
}

export { PLATE_PHOTO_ALLOWED_MIME, PLATE_PHOTO_MAX_BYTES };
