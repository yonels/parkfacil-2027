import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Etapa 3 de Inspectores (2026-08-28): tests de los archivos "server-only"
// (no importables directo bajo `node --test`, mismo criterio que el resto
// del módulo) por verificación de fuente -- mismo patrón ya usado en
// inspectorInspectionService.test.mjs / onStreetHierarchyFicha.test.mjs.

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

// --- Contexto territorial (§13/§14) ---

test("registerOnStreetInspection: el contexto manual SIEMPRE se re-verifica contra la base de datos -- nunca confía en el id recibido", async () => {
  const src = await source("./inspectorInspectionService.js");
  assert.match(src, /db\.from\("parkings"\)\.select\("id"\)\.eq\("id", contextParkingId\)\.eq\("type", "ON_STREET"\)\.eq\("status", "ACTIVE"\)/);
  assert.match(src, /db\.from\("on_street_qr_locations"\)\.select\("id,parking_id"\)\.eq\("id", contextQrLocationId\)/);
  assert.match(src, /locationCheck\.data\.parking_id === resolvedParkingId/, "un qr_location_id que no pertenezca al estacionamiento resuelto se descarta, nunca se usa a ciegas");
});

test("registerOnStreetInspection: el contexto manual solo se usa cuando NO hay sesión real (NO_SESSION/OTHER) -- OVERSTAY nunca lo necesita ni lo sobrescribe", async () => {
  const src = await source("./inspectorInspectionService.js");
  assert.match(src, /if \(!session && contextParkingId\) \{/, "el contexto solo se resuelve cuando session es null (no OVERSTAY)");
  assert.match(src, /let resolvedParkingId = session\?\.parking_id \|\| null;/);
});

test("/api/inspector/context: exige authorizeInspectorRequest (rol inspector), no expone datos de empresa a otros roles", async () => {
  const src = await source("../../app/api/inspector/context/route.js");
  assert.match(src, /authorizeInspectorRequest/);
});

test("listInspectorContextOptions: consulta global, sin ningún filtro de empresa/company_id -- preserva la decisión funcional §3 (alcance global del Inspector)", async () => {
  const src = await source("./inspectorRepository.js");
  const fnStart = src.indexOf("export async function listInspectorContextOptions");
  const fnSrc = src.slice(fnStart, src.indexOf("\n}", fnStart) + 2);
  assert.doesNotMatch(fnSrc, /company_id|companyId/i, "el contexto territorial del Inspector no debe filtrarse por empresa");
});

// --- Evidencia fotográfica (§17-20/§32/§42) ---

test("inspectorEvidenceRepository: límites documentados -- 8 MiB, JPEG/PNG/WebP, máximo 3 fotos por fiscalización", async () => {
  const src = await source("./inspectorEvidenceRepository.js");
  assert.match(src, /EVIDENCE_MAX_BYTES = 8 \* 1024 \* 1024/);
  assert.match(src, /EVIDENCE_ALLOWED_MIME = Object\.freeze\(\["image\/jpeg", "image\/png", "image\/webp"\]\)/);
  assert.match(src, /EVIDENCE_MAX_PER_INSPECTION = 3/);
});

test("uploadInspectionEvidence: valida tipo MIME, tamaño y el conteo existente ANTES de subir nada al bucket (defensa en profundidad, nunca confía solo en el cliente)", async () => {
  const src = await source("./inspectorEvidenceRepository.js");
  const fnStart = src.indexOf("export async function uploadInspectionEvidence");
  const fnSrc = src.slice(fnStart, src.indexOf("\nexport async function listInspectionEvidenceWithUrls"));
  assert.match(fnSrc, /if \(!EVIDENCE_ALLOWED_MIME\.includes\(mimeType\)\)/);
  assert.match(fnSrc, /if \(!\(sizeBytes > 0\) \|\| sizeBytes > EVIDENCE_MAX_BYTES\)/);
  assert.match(fnSrc, /if \(existing >= EVIDENCE_MAX_PER_INSPECTION\)/);
  // El orden importa: las 3 validaciones ocurren antes del storage.upload.
  const uploadCallIndex = fnSrc.indexOf("storage.from(EVIDENCE_BUCKET).upload");
  const lastValidationIndex = fnSrc.indexOf("EVIDENCE_LIMIT_REACHED");
  assert.ok(lastValidationIndex < uploadCallIndex, "las validaciones deben ejecutarse antes de subir el archivo");
});

test("uploadInspectionEvidence: bucket privado, nunca una URL pública -- listInspectionEvidenceWithUrls solo genera signed URLs de corta duración", async () => {
  const src = await source("./inspectorEvidenceRepository.js");
  assert.match(src, /createSignedUrl\(row\.storage_path, expiresInSeconds\)/);
  assert.doesNotMatch(src, /getPublicUrl/, "nunca debe generarse una URL pública permanente para evidencia");
});

test("uploadInspectionEvidence: si falla el registro de metadata después de subir el archivo, se compensa borrando el objeto huérfano (§42)", async () => {
  const src = await source("./inspectorEvidenceRepository.js");
  assert.match(src, /storage\.from\(EVIDENCE_BUCKET\)\.remove\(\[path\]\)\.catch\(\(\) => \{\}\)/);
});

test("/api/inspector/inspections/[id]/evidence: exige authorizeInspectorRequest y ownership -- un Inspector nunca puede leer/subir evidencia de una fiscalización ajena", async () => {
  const src = await source("../../app/api/inspector/inspections/[id]/evidence/route.js");
  assert.match(src, /authorizeInspectorRequest/);
  assert.match(src, /result\.data\.inspector_user_id !== inspectorUserId/);
});

test("/api/on-street-qr/fiscalizaciones/[id]/evidence: reutiliza getOnStreetInspectionDetail exclusivamente para el aislamiento por empresa -- no duplica ese chequeo", async () => {
  const src = await source("../../app/api/on-street-qr/fiscalizaciones/[id]/evidence/route.js");
  assert.match(src, /authorizeOnStreetAdminRequest/);
  assert.match(src, /getOnStreetInspectionDetail\(auth\.db, auth\.context, id\)/);
  assert.doesNotMatch(src, /getPublicUrl/);
});

// --- SMS "sin sesión" (§23): auditado, sin inventar mensaje ---

test("SIN_SESION/OTHER nunca dispara SMS: no hay session real (session=null), y sendInspectionSmsIfNeeded exige session?.phone_normalized -- confirmado por ausencia estructural, no por un chequeo explícito de tipo", async () => {
  const src = await source("./inspectorInspectionService.js");
  assert.match(src, /if \(inspectionType === "OVERSTAY"\) \{[\s\S]*?session = await getOnStreetSessionForInspection/, "session solo se puebla para OVERSTAY");
  assert.match(src, /if \(!inspection\.reused && inspection\.smsRequired && session\?\.phone_normalized\)/, "sin session (NO_SESSION/OTHER), session?.phone_normalized es undefined -- el SMS nunca se intenta");
});

// --- VIGENTE/VENCIDO con expires_at ya vencido (§37) ---

test("findOnStreetPlateState: barre sesiones vencidas ANTES de consultar -- una fila status=ACTIVE con expires_at ya pasado nunca llega a mostrarse VIGENTE al Inspector", async () => {
  const src = await source("./inspectorRepository.js");
  const fnStart = src.indexOf("export async function findOnStreetPlateState");
  const beforeQuery = src.slice(fnStart, src.indexOf('.eq("status", "ACTIVE")', fnStart));
  assert.match(beforeQuery, /await expireDueOnStreetPilotSessions\(db\);/, "el barrido debe ocurrir antes de la consulta status=ACTIVE");
});
