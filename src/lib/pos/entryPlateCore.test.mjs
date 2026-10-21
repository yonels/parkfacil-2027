import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyChileanPlate,
  classifyEntryFailure,
  entryErrorMessage,
  ENTRY_ERROR_MESSAGES,
  formatPlateForDisplay,
  isPlateAlreadyInside,
  isValidPosPlate,
  normalizePlateCandidate,
  parseOcrPlateText,
  parseSpokenPlate,
  spokenToCharacters,
} from "./entryPlateCore.mjs";

// POS Entry/Exit — Fase 2 (Entrada V2): reglas puras de captura manual,
// OCR y voz, y de los mensajes de error del ingreso.

// ---- 1-3) Manual: válido, inválido, normalización ----

test("1. ingreso manual válido: patentes chilenas de auto (nueva y antigua)", () => {
  assert.equal(isValidPosPlate("BBCD12"), true);
  assert.equal(isValidPosPlate("AB1234"), true);
  assert.equal(classifyChileanPlate("bbcd-12"), "NEW");
  assert.equal(classifyChileanPlate("ab·1234"), "OLD");
});

test("2. ingreso manual inválido: largo incorrecto, dígitos finales ausentes, vacío", () => {
  for (const value of ["", "ABC", "ABCD1", "ABCDEF", "ABCD123", "BBB12"]) {
    assert.equal(isValidPosPlate(value), false, `${value} no debe ser válida`);
  }
  // Moto (5 caracteres): bloqueada también por el CHECK de la base de datos.
  assert.equal(classifyChileanPlate("BBB12"), "INVALID");
});

test("3. normalización: mayúsculas, espacios, guiones, puntos, separador · y acentos", () => {
  assert.equal(normalizePlateCandidate(" bb-cd·12 "), "BBCD12");
  assert.equal(normalizePlateCandidate("ab.12 34"), "AB1234");
  assert.equal(normalizePlateCandidate("ÁB1234"), "AB1234");
  assert.equal(formatPlateForDisplay("bbcd12"), "BBCD-12");
});

// ---- 6-8) OCR ----

test("6. OCR propone la patente desde el texto reconocido (incluye ruido 'CHILE' y separadores)", () => {
  const result = parseOcrPlateText("BB·CD·12\nCHILE", 92);
  assert.equal(result.plate, "BBCD12");
  assert.equal(result.format, "NEW");
  assert.equal(result.lowConfidence, false);
  assert.equal(parseOcrPlateText("AB 1234", 90).plate, "AB1234");
});

test("OCR corrige confusiones letra/dígito solo donde el formato lo exige, y marca la lectura como dudosa", () => {
  const result = parseOcrPlateText("8BCD1Z", 95);
  assert.equal(result.plate, "BBCD12");
  assert.equal(result.substitutions, 2);
  assert.equal(result.lowConfidence, true, "cualquier corrección exige revisión explícita");
});

test("OCR con confianza baja o desconocida exige revisión", () => {
  assert.equal(parseOcrPlateText("BBCD12", 40).lowConfidence, true);
  assert.equal(parseOcrPlateText("BBCD12", null).lowConfidence, true);
  assert.equal(parseOcrPlateText("BBCD12", 0).lowConfidence, true);
});

test("8. OCR sin resultado: no inventa una patente (el flujo manual sigue disponible)", () => {
  for (const text of ["", "CHILE", "EE", "HOLA MUNDO"]) {
    const result = parseOcrPlateText(text, 15);
    assert.equal(result.plate, null, `"${text}" no debe producir patente`);
  }
});

// ---- 9-10) Voz ----

test("9. voz propone la patente: letras deletreadas y números en palabras o dígitos", () => {
  assert.equal(parseSpokenPlate("be be ce de doce").plate, "BBCD12");
  assert.equal(parseSpokenPlate("AB CD 12").plate, "ABCD12");
  assert.equal(parseSpokenPlate("a be treinta y dos cuarenta y cinco").plate, "AB3245");
  assert.equal(parseSpokenPlate("doble ve i griega jota ka uno dos").plate, "WYJK12");
  assert.equal(spokenToCharacters("hache ere ese te"), "HRST");
});

test("voz usa la primera alternativa que forma una patente válida", () => {
  const result = parseSpokenPlate(["hola", "be be ce de doce"]);
  assert.equal(result.plate, "BBCD12");
  assert.equal(result.transcript, "be be ce de doce");
});

test("voz no entendida -> sin patente (nunca inventa)", () => {
  assert.equal(parseSpokenPlate("hola buenas tardes").plate, null);
  assert.equal(parseSpokenPlate([]).plate, null);
});

// ---- 15-16) Duplicados / vehículo ya ingresado ----

test("15/16. 409 de vehículo ya ingresado -> VEHICLE_ALREADY_INSIDE (nunca error genérico)", () => {
  assert.equal(classifyEntryFailure(409, { error: "x", details: { code: "VEHICLE_ALREADY_INSIDE" } }), "VEHICLE_ALREADY_INSIDE");
  // Compatibilidad: un 409 de ENTRY sin código (backend anterior) también es duplicado.
  assert.equal(classifyEntryFailure(409, { error: "Este vehículo ya se encuentra dentro del estacionamiento." }), "VEHICLE_ALREADY_INSIDE");
  assert.match(entryErrorMessage("VEHICLE_ALREADY_INSIDE"), /VEHÍCULO YA INGRESADO/);
});

test("otros rechazos del backend conservan su causa específica", () => {
  assert.equal(classifyEntryFailure(409, { details: { code: "OPEN_SHIFT_REQUIRED" } }), "OPEN_SHIFT_REQUIRED");
  assert.equal(classifyEntryFailure(400, { details: { code: "PLATE_PHOTO_REQUIRED" } }), "PLATE_PHOTO_REQUIRED");
  assert.equal(classifyEntryFailure(400, { details: { plate: "Formato requerido: CXPY93" } }), "INVALID_PLATE");
  assert.equal(classifyEntryFailure(409, { code: "PARKING_SELECTION_REQUIRED" }), "PARKING_SELECTION_REQUIRED");
  assert.equal(classifyEntryFailure(503, {}), "BACKEND_UNAVAILABLE");
  assert.equal(classifyEntryFailure(418, {}), "UNEXPECTED");
});

test("aviso preventivo de vehículo ya ingresado contra las estadías OPEN cargadas (con o sin guion)", () => {
  const stays = [{ license_plate: "BBCD-12" }, { license_plate: "AB-1234" }];
  assert.equal(isPlateAlreadyInside("bbcd12", stays), true);
  assert.equal(isPlateAlreadyInside("AB1234", stays), true);
  assert.equal(isPlateAlreadyInside("ZZZZ99", stays), false);
  assert.equal(isPlateAlreadyInside("", stays), false);
});

// ---- 15) Mensajes: el operador sabe qué hacer ----

test("cada error definido tiene un mensaje con acción siguiente", () => {
  const required = [
    "INVALID_PLATE", "VEHICLE_ALREADY_INSIDE", "CAMERA_UNAVAILABLE", "CAMERA_PERMISSION_DENIED", "OCR_FAILED",
    "OCR_NO_RESULT", "OCR_LOW_CONFIDENCE", "MIC_UNAVAILABLE", "MIC_PERMISSION_DENIED", "VOICE_NOT_UNDERSTOOD",
    "VOICE_UNSUPPORTED", "VOICE_LOCAL_UNAVAILABLE", "PLATE_PHOTO_REQUIRED", "BACKEND_UNAVAILABLE", "NETWORK_ERROR", "UNEXPECTED",
  ];
  for (const code of required) {
    assert.ok(ENTRY_ERROR_MESSAGES[code] && ENTRY_ERROR_MESSAGES[code].length > 20, `${code} sin mensaje`);
  }
  assert.equal(entryErrorMessage("CODIGO_INEXISTENTE"), ENTRY_ERROR_MESSAGES.UNEXPECTED);
});
