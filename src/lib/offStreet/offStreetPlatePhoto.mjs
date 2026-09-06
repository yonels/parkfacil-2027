// Off Street — Fase 6: reglas puras de "fotografía de patente en ENTRY".
// Sin dependencias de Supabase/DOM/bridge para que sean 100% unit-testeables
// (mismo criterio que el resto de módulos "*Core.mjs" del proyecto).

export const PLATE_PHOTO_MODES = Object.freeze(["DISABLED", "OPTIONAL", "REQUIRED"]);

export const DEFAULT_PLATE_PHOTO_SETTINGS = Object.freeze({
  plateMode: "DISABLED",
  printOnTicket: false,
  evidenceRetentionDays: null,
});

// Tipos/tamaño aceptados para la fotografía ya comprimida por el cliente.
// Debe coincidir con el bucket/tabla (ver migración 20260905130000).
export const PLATE_PHOTO_ALLOWED_MIME = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
export const PLATE_PHOTO_MAX_BYTES = 716800; // 700 KiB — ver nota en la migración.

export function isValidPlatePhotoMode(value) {
  return PLATE_PHOTO_MODES.includes(value);
}

// Retenciones válidas para el modelo de configuración (§11): el borrado
// automático queda fuera de esta fase, pero el valor ya se puede declarar.
export function isValidRetentionDays(value) {
  return value === null || value === undefined || [30, 60, 90].includes(Number(value));
}

// Único punto de decisión de "¿se puede completar el ENTRY con lo que hay?".
// DISABLED/OPTIONAL: siempre sí. REQUIRED: solo con foto válida ya subida.
export function canCompleteEntry(mode, hasValidPhoto) {
  if (mode === "REQUIRED") return Boolean(hasValidPhoto);
  return true;
}

export function entryPhotoRequirementMessage(mode) {
  if (mode === "REQUIRED") {
    return "Debes tomar una fotografía de la patente antes de confirmar el ingreso.";
  }
  return "";
}

// Valida el archivo ya comprimido antes de intentar subirlo (defensa en
// profundidad — el bucket/la tabla vuelven a validar esto mismo).
export function validatePlatePhotoFile({ mimeType, sizeBytes } = {}) {
  if (!PLATE_PHOTO_ALLOWED_MIME.includes(mimeType)) {
    return { valid: false, code: "PLATE_PHOTO_MIME_NOT_ALLOWED", message: "Formato de imagen no admitido." };
  }
  if (!(Number(sizeBytes) > 0) || Number(sizeBytes) > PLATE_PHOTO_MAX_BYTES) {
    return { valid: false, code: "PLATE_PHOTO_TOO_LARGE", message: "La fotografía es demasiado pesada." };
  }
  return { valid: true, code: "", message: "" };
}

// Decide si corresponde imprimir la fotografía en el ticket y por qué no,
// cuando corresponda. Nunca "inventa" soporte: solo indica incluir la
// imagen cuando el bridge activo declaró explícitamente que puede
// imprimirla (bridgeSupportsImage) — ver getNativePrinterImageSupport en
// PosTerminal.js. Si no hay soporte, el ticket de texto se imprime igual
// (fallback obligatorio, §9): esta función nunca bloquea la impresión, solo
// decide si la imagen va incluida.
export function resolvePlatePhotoPrintDecision({ printOnTicket, hasPhoto, bridgeSupportsImage }) {
  if (!printOnTicket) return { includePhoto: false, reason: "PRINT_DISABLED" };
  if (!hasPhoto) return { includePhoto: false, reason: "NO_PHOTO" };
  if (!bridgeSupportsImage) return { includePhoto: false, reason: "BRIDGE_NO_IMAGE_SUPPORT" };
  return { includePhoto: true, reason: "" };
}

// Arma el payload final que se envía al bridge de impresión, agregando (o
// no) el campo de imagen según resolvePlatePhotoPrintDecision. Nunca muta el
// payload original ni falla si falta algún dato — mantiene el ticket de
// texto imprimible siempre.
export function buildPrintableEntryPayload(basePayload, { photoBase64, printOnTicket, bridgeSupportsImage } = {}) {
  if (!basePayload) return { payload: null, includePhoto: false, reason: "NO_PAYLOAD" };
  const decision = resolvePlatePhotoPrintDecision({
    printOnTicket: Boolean(printOnTicket),
    hasPhoto: Boolean(photoBase64),
    bridgeSupportsImage: Boolean(bridgeSupportsImage),
  });
  if (!decision.includePhoto) return { payload: basePayload, includePhoto: false, reason: decision.reason };
  return { payload: { ...basePayload, platePhotoBase64: photoBase64 }, includePhoto: true, reason: "" };
}
