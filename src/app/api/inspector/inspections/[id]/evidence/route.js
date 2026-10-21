import { NextResponse } from "next/server";
import { authorizeInspectorRequest } from "@/lib/auth/inspectorAuthorization";
import {
  EVIDENCE_ALLOWED_MIME,
  EVIDENCE_MAX_BYTES,
  listInspectionEvidenceWithUrls,
  uploadInspectionEvidence,
} from "@/lib/inspector/inspectorEvidenceRepository";

function fail(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Ownership: un Inspector solo puede leer/subir evidencia de SU PROPIA
// fiscalización -- nunca la de otro inspector (§4: Inspector no administra,
// no ve trabajo ajeno).
async function ownInspectionOrNull(db, inspectionId, inspectorUserId) {
  const result = await db.from("on_street_inspections").select("id,inspector_user_id").eq("id", inspectionId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data || result.data.inspector_user_id !== inspectorUserId) return null;
  return result.data;
}

// Evidencia fotográfica (Etapa 3, §17-20): subida real desde el
// dispositivo del Inspector. Validación server-side de tipo MIME y tamaño
// (defensa en profundidad, ver inspectorEvidenceRepository.js) -- nunca se
// confía únicamente en la compresión/validación del cliente. Hasta 3 fotos
// por fiscalización.
export async function POST(request, { params }) {
  const authorization = await authorizeInspectorRequest(request);
  if (authorization.response) return authorization.response;
  const { id } = await params;

  const inspection = await ownInspectionOrNull(authorization.db, id, authorization.context.userId);
  if (!inspection) return fail("Fiscalización no encontrada.", 404);

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return fail("Solicitud inválida.");
  }
  const file = formData.get("file");
  if (!file || typeof file === "string") return fail("Falta el archivo de evidencia.");
  if (!EVIDENCE_ALLOWED_MIME.includes(file.type)) return fail(`Tipo de archivo no permitido. Usa ${EVIDENCE_ALLOWED_MIME.join(", ")}.`);
  if (file.size > EVIDENCE_MAX_BYTES) return fail(`El archivo supera el tamaño máximo permitido (${Math.round(EVIDENCE_MAX_BYTES / 1024 / 1024)} MB).`);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const evidence = await uploadInspectionEvidence(authorization.db, {
      inspectionId: id,
      buffer,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    return NextResponse.json({ data: evidence }, { status: 201 });
  } catch (cause) {
    const status = Number(cause?.status) || 503;
    return fail(status < 500 ? cause.message : "No fue posible subir la evidencia.", status < 500 ? status : 503);
  }
}

// Lista la evidencia ya subida de la propia fiscalización, con signed URLs
// de corta duración -- nunca una URL pública permanente.
export async function GET(request, { params }) {
  const authorization = await authorizeInspectorRequest(request);
  if (authorization.response) return authorization.response;
  const { id } = await params;

  const inspection = await ownInspectionOrNull(authorization.db, id, authorization.context.userId);
  if (!inspection) return fail("Fiscalización no encontrada.", 404);

  try {
    const data = await listInspectionEvidenceWithUrls(authorization.db, id);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[INSPECTOR_EVIDENCE_LIST]", { code: error.code || error.message });
    return fail("No fue posible cargar la evidencia.", 503);
  }
}
