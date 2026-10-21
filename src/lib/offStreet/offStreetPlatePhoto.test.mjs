import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_EVIDENCE_TYPE,
  EVIDENCE_TYPES,
  GPS_MODES,
  PLATE_PHOTO_MODES,
  buildPrintableEntryPayload,
  canCompleteEntry,
  canCompleteEvidenceGps,
  entryPhotoRequirementMessage,
  gpsRequirementMessage,
  isValidEvidenceType,
  isValidGpsMode,
  isValidPlatePhotoMode,
  isValidRetentionDays,
  resolvePlatePhotoPrintDecision,
  validatePlatePhotoFile,
} from "./offStreetPlatePhoto.mjs";

// ---- CONFIG: validación de modo/retención (§13 del encargo) ----

test("isValidPlatePhotoMode acepta solo DISABLED/OPTIONAL/REQUIRED", () => {
  assert.equal(isValidPlatePhotoMode("DISABLED"), true);
  assert.equal(isValidPlatePhotoMode("OPTIONAL"), true);
  assert.equal(isValidPlatePhotoMode("REQUIRED"), true);
  assert.equal(isValidPlatePhotoMode("OTRO"), false);
  assert.equal(isValidPlatePhotoMode(""), false);
  assert.equal(isValidPlatePhotoMode(undefined), false);
});

test("isValidRetentionDays acepta null/30/60/90, rechaza el resto", () => {
  assert.equal(isValidRetentionDays(null), true);
  assert.equal(isValidRetentionDays(undefined), true);
  assert.equal(isValidRetentionDays(30), true);
  assert.equal(isValidRetentionDays(60), true);
  assert.equal(isValidRetentionDays(90), true);
  assert.equal(isValidRetentionDays(45), false);
  assert.equal(isValidRetentionDays(0), false);
});

// ---- ENTRY: gating por modo (§13 del encargo) ----

test("DISABLED: se puede completar el ingreso con o sin foto", () => {
  assert.equal(canCompleteEntry("DISABLED", false), true);
  assert.equal(canCompleteEntry("DISABLED", true), true);
});

test("OPTIONAL: se puede completar el ingreso con o sin foto", () => {
  assert.equal(canCompleteEntry("OPTIONAL", false), true);
  assert.equal(canCompleteEntry("OPTIONAL", true), true);
});

test("REQUIRED: bloquea sin foto, acepta con foto", () => {
  assert.equal(canCompleteEntry("REQUIRED", false), false);
  assert.equal(canCompleteEntry("REQUIRED", true), true);
});

test("entryPhotoRequirementMessage solo tiene texto para REQUIRED", () => {
  assert.equal(entryPhotoRequirementMessage("DISABLED"), "");
  assert.equal(entryPhotoRequirementMessage("OPTIONAL"), "");
  assert.notEqual(entryPhotoRequirementMessage("REQUIRED"), "");
});

// ---- STORAGE: validación de archivo antes de subir ----

test("validatePlatePhotoFile rechaza mime no permitido", () => {
  const result = validatePlatePhotoFile({ mimeType: "application/pdf", sizeBytes: 1000 });
  assert.equal(result.valid, false);
  assert.equal(result.code, "PLATE_PHOTO_MIME_NOT_ALLOWED");
});

test("validatePlatePhotoFile rechaza tamaño excesivo o vacío", () => {
  assert.equal(validatePlatePhotoFile({ mimeType: "image/jpeg", sizeBytes: 0 }).valid, false);
  assert.equal(validatePlatePhotoFile({ mimeType: "image/jpeg", sizeBytes: 800000 }).valid, false);
});

test("validatePlatePhotoFile acepta jpeg/png/webp dentro del límite", () => {
  for (const mimeType of ["image/jpeg", "image/png", "image/webp"]) {
    assert.equal(validatePlatePhotoFile({ mimeType, sizeBytes: 200000 }).valid, true);
  }
});

// ---- PRINT: decisión de incluir la imagen en el ticket (§8/§9/§13) ----

test("resolvePlatePhotoPrintDecision: flag apagado nunca incluye la foto", () => {
  const decision = resolvePlatePhotoPrintDecision({ printOnTicket: false, hasPhoto: true, bridgeSupportsImage: true });
  assert.equal(decision.includePhoto, false);
  assert.equal(decision.reason, "PRINT_DISABLED");
});

test("resolvePlatePhotoPrintDecision: flag encendido pero sin foto no incluye nada", () => {
  const decision = resolvePlatePhotoPrintDecision({ printOnTicket: true, hasPhoto: false, bridgeSupportsImage: true });
  assert.equal(decision.includePhoto, false);
  assert.equal(decision.reason, "NO_PHOTO");
});

test("resolvePlatePhotoPrintDecision: bridge sin soporte de imagen -- nunca se inventa soporte", () => {
  const decision = resolvePlatePhotoPrintDecision({ printOnTicket: true, hasPhoto: true, bridgeSupportsImage: false });
  assert.equal(decision.includePhoto, false);
  assert.equal(decision.reason, "BRIDGE_NO_IMAGE_SUPPORT");
});

test("resolvePlatePhotoPrintDecision: flag + foto + bridge compatible -- sí incluye", () => {
  const decision = resolvePlatePhotoPrintDecision({ printOnTicket: true, hasPhoto: true, bridgeSupportsImage: true });
  assert.equal(decision.includePhoto, true);
  assert.equal(decision.reason, "");
});

test("buildPrintableEntryPayload: ticket normal (sin campo de imagen) cuando no corresponde incluir la foto", () => {
  const base = { type: "ENTRY", plate: "ABCD-12" };
  const result = buildPrintableEntryPayload(base, { photoBase64: null, printOnTicket: true, bridgeSupportsImage: true });
  assert.equal(result.includePhoto, false);
  assert.deepEqual(result.payload, base);
  assert.equal("platePhotoBase64" in result.payload, false);
});

test("buildPrintableEntryPayload: agrega platePhotoBase64 solo cuando corresponde", () => {
  const base = { type: "ENTRY", plate: "ABCD-12" };
  const result = buildPrintableEntryPayload(base, { photoBase64: "data:image/jpeg;base64,AAA", printOnTicket: true, bridgeSupportsImage: true });
  assert.equal(result.includePhoto, true);
  assert.equal(result.payload.platePhotoBase64, "data:image/jpeg;base64,AAA");
  // El payload original no se muta -- el ticket de texto sigue disponible tal cual.
  assert.equal("platePhotoBase64" in base, false);
});

test("buildPrintableEntryPayload: un payload nulo nunca revienta (ticket ya perdido, no hay nada que imprimir)", () => {
  const result = buildPrintableEntryPayload(null, { photoBase64: "x", printOnTicket: true, bridgeSupportsImage: true });
  assert.equal(result.payload, null);
  assert.equal(result.includePhoto, false);
});

// ---- Ajuste final: GPS configurable -- MISMO enum/semántica que el modo de foto (§2/§18/§19) ----

test("GPS_MODES es exactamente PLATE_PHOTO_MODES -- nunca un segundo enum paralelo", () => {
  assert.equal(GPS_MODES, PLATE_PHOTO_MODES);
});

test("isValidGpsMode acepta solo DISABLED/OPTIONAL/REQUIRED, igual que el modo de foto", () => {
  assert.equal(isValidGpsMode("DISABLED"), true);
  assert.equal(isValidGpsMode("OPTIONAL"), true);
  assert.equal(isValidGpsMode("REQUIRED"), true);
  assert.equal(isValidGpsMode("OTRO"), false);
});

test("canCompleteEvidenceGps: DISABLED/OPTIONAL nunca bloquean, REQUIRED exige posición válida", () => {
  assert.equal(canCompleteEvidenceGps("DISABLED", false), true);
  assert.equal(canCompleteEvidenceGps("OPTIONAL", false), true);
  assert.equal(canCompleteEvidenceGps("REQUIRED", false), false);
  assert.equal(canCompleteEvidenceGps("REQUIRED", true), true);
});

test("gpsRequirementMessage solo tiene texto para REQUIRED", () => {
  assert.equal(gpsRequirementMessage("DISABLED"), "");
  assert.equal(gpsRequirementMessage("OPTIONAL"), "");
  assert.notEqual(gpsRequirementMessage("REQUIRED"), "");
});

// ---- Ajuste final: tipo de evidencia -- nunca marcar un render como foto real (§21) ----

test("EVIDENCE_TYPES distingue PHOTO_CAPTURED de PLATE_RENDERED, sin valores inventados", () => {
  assert.deepEqual(EVIDENCE_TYPES, ["PHOTO_CAPTURED", "PLATE_RENDERED"]);
  assert.equal(DEFAULT_EVIDENCE_TYPE, "PHOTO_CAPTURED");
});

test("isValidEvidenceType rechaza cualquier valor fuera del enum", () => {
  assert.equal(isValidEvidenceType("PHOTO_CAPTURED"), true);
  assert.equal(isValidEvidenceType("PLATE_RENDERED"), true);
  assert.equal(isValidEvidenceType("FOTO_REAL"), false);
  assert.equal(isValidEvidenceType(undefined), false);
});
