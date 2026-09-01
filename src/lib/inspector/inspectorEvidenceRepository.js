import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

// Evidencia fotográfica de fiscalización (Etapa 3, §17-20/§32). Bucket
// PRIVADO (ver migración 20260828150000): nunca se expone una URL pública
// permanente -- toda lectura pasa por createSignedUrl (corta duración),
// generada aquí, nunca en el cliente. Reutilizado tanto por la app de
// Inspectores (su propia evidencia) como por la Administración (evidencia
// de cualquier fiscalización dentro de su alcance) -- una sola fuente de
// verdad, sin tabla ni bucket paralelo.
export const EVIDENCE_BUCKET = "on-street-inspection-evidence";
export const EVIDENCE_MAX_BYTES = 8 * 1024 * 1024; // 8 MiB -- igual al file_size_limit del bucket (defensa en profundidad).
export const EVIDENCE_ALLOWED_MIME = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
export const EVIDENCE_MAX_PER_INSPECTION = 3;

const EXT_BY_MIME = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function countEvidenceForInspection(db, inspectionId) {
  const result = await db.from("on_street_inspection_evidence").select("id", { count: "exact", head: true }).eq("inspection_id", inspectionId);
  if (result.error) throw result.error;
  return result.count || 0;
}

// Sube el archivo al bucket privado e inserta su metadata. Validación de
// tipo/tamaño ya debe haberse hecho por el llamador (defensa en
// profundidad: también se revalida aquí antes de subir nada).
export async function uploadInspectionEvidence(db, { inspectionId, buffer, mimeType, sizeBytes }) {
  if (!EVIDENCE_ALLOWED_MIME.includes(mimeType)) {
    throw Object.assign(new Error("EVIDENCE_MIME_NOT_ALLOWED"), { code: "EVIDENCE_MIME_NOT_ALLOWED", status: 400 });
  }
  if (!(sizeBytes > 0) || sizeBytes > EVIDENCE_MAX_BYTES) {
    throw Object.assign(new Error("EVIDENCE_TOO_LARGE"), { code: "EVIDENCE_TOO_LARGE", status: 400 });
  }
  const existing = await countEvidenceForInspection(db, inspectionId);
  if (existing >= EVIDENCE_MAX_PER_INSPECTION) {
    throw Object.assign(new Error("EVIDENCE_LIMIT_REACHED"), { code: "EVIDENCE_LIMIT_REACHED", status: 409 });
  }
  const path = `${inspectionId}/${crypto.randomUUID()}.${EXT_BY_MIME[mimeType]}`;
  const upload = await db.storage.from(EVIDENCE_BUCKET).upload(path, buffer, { contentType: mimeType, upsert: false });
  if (upload.error) throw Object.assign(new Error("EVIDENCE_UPLOAD_FAILED"), { code: "EVIDENCE_UPLOAD_FAILED", status: 503, cause: upload.error });
  const inserted = await db.from("on_street_inspection_evidence").insert({ inspection_id: inspectionId, storage_path: path, mime_type: mimeType, size_bytes: sizeBytes }).select("id,storage_path,mime_type,size_bytes,created_at").single();
  if (inserted.error) {
    // Compensación (§42): si el registro de metadata falla después de subir
    // el archivo, se intenta borrar el objeto huérfano del bucket -- best
    // effort, no bloquea el reporte del error real al llamador.
    await db.storage.from(EVIDENCE_BUCKET).remove([path]).catch(() => {});
    throw inserted.error;
  }
  return inserted.data;
}

export async function listInspectionEvidenceWithUrls(db = getSupabaseAdminClient(), inspectionId, expiresInSeconds = 300) {
  const result = await db.from("on_street_inspection_evidence").select("id,storage_path,mime_type,size_bytes,created_at").eq("inspection_id", inspectionId).order("created_at");
  if (result.error) throw result.error;
  const rows = result.data || [];
  if (!rows.length) return [];
  return Promise.all(rows.map(async (row) => {
    const signed = await db.storage.from(EVIDENCE_BUCKET).createSignedUrl(row.storage_path, expiresInSeconds);
    return { id: row.id, mimeType: row.mime_type, sizeBytes: row.size_bytes, createdAt: row.created_at, url: signed.error ? null : signed.data?.signedUrl || null };
  }));
}
