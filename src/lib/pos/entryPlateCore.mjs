// POS Entry/Exit — Fase 2 (Entrada V2): reglas puras de captura de patente
// (manual, OCR y voz) y de los mensajes de error del ingreso. Sin DOM, sin
// Tesseract, sin Web Speech: 100% unit-testeable, mismo criterio que el
// resto de módulos "*Core.mjs" del proyecto.
//
// Formatos aceptados: los MISMOS que ya acepta el POS y la base de datos
// (parking_stays.license_plate CHECK ~ '^[A-Z0-9]{4}-[A-Z0-9]{2}$' y
// POS_PLATE_REGEX = 4 alfanuméricos + 2 dígitos). Cubre las patentes
// chilenas de auto: nueva (BBBB·10, 4 letras + 2 dígitos) y antigua
// (AB·1234, 2 letras + 4 dígitos). Las patentes de moto de 5 caracteres
// (BBB·10 / AB·123) NO caben en el CHECK de la base de datos -- ampliarlo
// requiere una migración, fuera de esta fase.

export const PLATE_LENGTH = 6;
const POS_PLATE_PATTERN = /^[A-Z0-9]{4}[0-9]{2}$/;
const NEW_FORMAT = /^[A-Z]{4}[0-9]{2}$/;
const OLD_FORMAT = /^[A-Z]{2}[0-9]{4}$/;

export const PLATE_SOURCES = Object.freeze({
  MANUAL: "MANUAL",
  OCR: "OCR",
  VOICE: "VOICE",
});

// Deja solo A-Z/0-9 en mayúsculas (quita espacios, guiones, puntos, el
// separador "·" de la patente física, acentos, etc.).
export function normalizePlateCandidate(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function isValidPosPlate(value) {
  return POS_PLATE_PATTERN.test(normalizePlateCandidate(value));
}

export function classifyChileanPlate(value) {
  const plate = normalizePlateCandidate(value);
  if (NEW_FORMAT.test(plate)) return "NEW";
  if (OLD_FORMAT.test(plate)) return "OLD";
  if (POS_PLATE_PATTERN.test(plate)) return "OTHER";
  return "INVALID";
}

// "ABCD12" -> "ABCD-12" (misma presentación que el ticket/formulario).
export function formatPlateForDisplay(value) {
  const plate = normalizePlateCandidate(value);
  return plate.length === PLATE_LENGTH ? `${plate.slice(0, 4)}-${plate.slice(4)}` : plate;
}

// ---------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------

// Confusiones típicas del OCR entre letras y dígitos. Solo se aplican en la
// posición donde el formato exige el otro tipo de carácter (nunca "adivina"
// una patente que no calce con un formato válido).
const DIGIT_TO_LETTER = Object.freeze({ 0: "O", 1: "I", 2: "Z", 4: "A", 5: "S", 6: "G", 7: "T", 8: "B" });
const LETTER_TO_DIGIT = Object.freeze({ O: "0", Q: "0", D: "0", U: "0", I: "1", L: "1", J: "1", Z: "2", A: "4", S: "5", G: "6", T: "7", B: "8" });

function coerce(window, letterCount) {
  let substitutions = 0;
  let realLetters = 0;
  let realDigits = 0;
  let out = "";
  for (let index = 0; index < window.length; index += 1) {
    const char = window[index];
    const wantsLetter = index < letterCount;
    if (wantsLetter) {
      if (/[A-Z]/.test(char)) { out += char; realLetters += 1; }
      else if (DIGIT_TO_LETTER[char]) { out += DIGIT_TO_LETTER[char]; substitutions += 1; }
      else return null;
    } else if (/[0-9]/.test(char)) {
      out += char;
      realDigits += 1;
    } else if (LETTER_TO_DIGIT[char]) {
      out += LETTER_TO_DIGIT[char];
      substitutions += 1;
    } else {
      return null;
    }
  }
  // Nunca una patente "inventada" solo a base de correcciones: cada zona
  // (letras y dígitos) debe traer al menos un carácter real de su tipo
  // (p. ej. "HOLA MUNDO" no puede convertirse en AMUN-00).
  if (realLetters === 0 || realDigits === 0) return null;
  return { plate: out, substitutions };
}

export const OCR_MIN_CONFIDENCE = 70;

// Interpreta el texto reconocido por el OCR y propone UNA patente. Nunca
// registra nada: el resultado siempre pasa por la confirmación del operador.
// lowConfidence = el OCR dudó (confianza baja) o hubo que corregir
// caracteres ambiguos -- la UI debe pedir revisión explícita.
export function parseOcrPlateText(text, confidence = null) {
  const raw = String(text ?? "");
  const segments = raw
    .toUpperCase()
    .split(/\r?\n/)
    .map((line) => normalizePlateCandidate(line))
    .filter(Boolean);
  const joined = segments.join("");
  const sources = [...segments, joined];

  let best = null;
  for (const source of sources) {
    for (let start = 0; start + PLATE_LENGTH <= source.length; start += 1) {
      const window = source.slice(start, start + PLATE_LENGTH);
      for (const [format, letterCount] of [["NEW", 4], ["OLD", 2]]) {
        const attempt = coerce(window, letterCount);
        if (!attempt) continue;
        const candidate = { plate: attempt.plate, format, substitutions: attempt.substitutions };
        if (
          !best ||
          candidate.substitutions < best.substitutions ||
          (candidate.substitutions === best.substitutions && best.format === "OLD" && format === "NEW")
        ) {
          best = candidate;
        }
      }
    }
  }

  const numericConfidence = Number.isFinite(Number(confidence)) ? Number(confidence) : null;
  if (!best) {
    return { plate: null, format: null, confidence: numericConfidence, lowConfidence: true, substitutions: 0, rawText: raw };
  }
  const lowConfidence = best.substitutions > 0 || numericConfidence === null || numericConfidence < OCR_MIN_CONFIDENCE;
  return { plate: best.plate, format: best.format, confidence: numericConfidence, lowConfidence, substitutions: best.substitutions, rawText: raw };
}

// ---------------------------------------------------------------------
// Voz (dictado en español, p. ej. "be be ce de doce" / "AB CD 12")
// ---------------------------------------------------------------------

const MULTIWORD_LETTERS = [
  ["doble uve", "W"], ["doble ve", "W"], ["doble u", "W"], ["uve doble", "W"],
  ["i griega", "Y"], ["ve corta", "V"], ["ve chica", "V"], ["be larga", "B"], ["be grande", "B"],
];

const LETTER_WORDS = Object.freeze({
  a: "A", be: "B", ce: "C", de: "D", e: "E", efe: "F", ge: "G", hache: "H", ache: "H", i: "I",
  jota: "J", ka: "K", ca: "K", ele: "L", eme: "M", ene: "N", o: "O", pe: "P", cu: "Q",
  erre: "R", ere: "R", ese: "S", te: "T", u: "U", uve: "V", ve: "V", equis: "X", ye: "Y",
  zeta: "Z", ceta: "Z", seta: "Z",
});

const UNITS = Object.freeze({
  cero: 0, uno: 1, una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
});
const TEENS = Object.freeze({
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
});
const TENS = Object.freeze({
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
});

function stripAccents(value) {
  return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Convierte una transcripción en la secuencia de caracteres dictada.
export function spokenToCharacters(transcript) {
  let text = ` ${stripAccents(transcript).replace(/[^a-z0-9ñ ]/g, " ")} `;
  for (const [phrase, letter] of MULTIWORD_LETTERS) {
    // split/join (no replaceAll): WebView 83 de la PRO2 no tiene replaceAll (Chrome 85+).
    text = text.split(` ${phrase} `).join(` ${letter.toLowerCase()}# `);
  }
  const tokens = text.split(/\s+/).filter(Boolean);
  let out = "";
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.endsWith("#")) { out += token.slice(0, -1).toUpperCase(); continue; }
    if (token in TENS) {
      const next = tokens[index + 1];
      const unit = tokens[index + 2];
      if (next === "y" && unit in UNITS) {
        out += String(TENS[token] + UNITS[unit]);
        index += 2;
      } else {
        out += String(TENS[token]);
      }
      continue;
    }
    if (token in TEENS) { out += String(TEENS[token]); continue; }
    if (token in UNITS) { out += String(UNITS[token]); continue; }
    if (token in LETTER_WORDS) { out += LETTER_WORDS[token]; continue; }
    if (token === "y") { out += "Y"; continue; }
    if (token === "ñ" || token === "enie") { out += "N"; continue; }
    if (/^[a-z0-9]+$/.test(token)) { out += token.toUpperCase(); continue; }
  }
  return out;
}

// Propone una patente desde una o varias alternativas de transcripción
// (SpeechRecognition entrega hasta maxAlternatives). Nunca registra nada.
export function parseSpokenPlate(alternatives) {
  const list = (Array.isArray(alternatives) ? alternatives : [alternatives]).filter((item) => item != null);
  for (const transcript of list) {
    const characters = spokenToCharacters(transcript);
    if (isValidPosPlate(characters)) return { plate: characters, transcript: String(transcript) };
    for (let start = 0; start + PLATE_LENGTH <= characters.length; start += 1) {
      const window = characters.slice(start, start + PLATE_LENGTH);
      if (isValidPosPlate(window)) return { plate: window, transcript: String(transcript) };
    }
  }
  return { plate: null, transcript: list.length ? String(list[0]) : "" };
}

// ---------------------------------------------------------------------
// Errores del ingreso: qué pasó y qué debe hacer el operador.
// ---------------------------------------------------------------------

export const ENTRY_ERROR_MESSAGES = Object.freeze({
  INVALID_PLATE: "Patente inválida. Revisa que tenga 6 caracteres (ej.: BBCD-12 o AB-1234) y corrígela.",
  VEHICLE_ALREADY_INSIDE: "VEHÍCULO YA INGRESADO: esta patente ya tiene un ingreso abierto en este estacionamiento. Búscala en SALIDA o en VEHÍCULOS EN EL PARKING.",
  OPEN_SHIFT_REQUIRED: "No tienes un turno abierto. Inicia tu turno antes de registrar ingresos.",
  PLATE_PHOTO_REQUIRED: "Este estacionamiento exige fotografía de la patente. Tómala para poder registrar el ingreso.",
  PLATE_PHOTO_GPS_REQUIRED: "No fue posible obtener la ubicación GPS de la fotografía. Activa la ubicación y vuelve a tomarla.",
  PLATE_PHOTO_UPLOAD_FAILED: "No fue posible subir la fotografía. Intenta registrar nuevamente.",
  PARKING_SELECTION_REQUIRED: "Debes iniciar el turno del estacionamiento que vas a operar antes de registrar ingresos.",
  BACKEND_UNAVAILABLE: "El servidor no está disponible en este momento. Espera unos segundos e intenta nuevamente; el ingreso NO quedó registrado.",
  NETWORK_ERROR: "Sin conexión con el servidor. Revisa la red e intenta nuevamente; el ingreso NO quedó registrado.",
  UNEXPECTED: "Ocurrió un error inesperado. Intenta nuevamente; si persiste, contacta a soporte.",
  CAMERA_UNAVAILABLE: "No hay una cámara disponible en este dispositivo. Ingresa la patente manualmente.",
  CAMERA_PERMISSION_DENIED: "El permiso de cámara fue denegado. Autorízalo en el navegador o ingresa la patente manualmente.",
  OCR_LOAD_FAILED: "No fue posible cargar el lector de patentes. Ingresa la patente manualmente.",
  OCR_FAILED: "No fue posible leer la patente. Intenta nuevamente con mejor encuadre o ingrésala manualmente.",
  OCR_NO_RESULT: "No se reconoció una patente en la imagen. Acerca la cámara, encuadra la patente o ingrésala manualmente.",
  OCR_LOW_CONFIDENCE: "Lectura dudosa: revisa cada carácter antes de confirmar.",
  VOICE_UNSUPPORTED: "El dictado por voz no está disponible en este dispositivo. Ingresa la patente manualmente.",
  VOICE_LOCAL_UNAVAILABLE: "El dictado por voz requiere reconocimiento en el propio dispositivo, que no está disponible aquí. Ingresa la patente manualmente.",
  MIC_UNAVAILABLE: "No hay un micrófono disponible. Ingresa la patente manualmente.",
  MIC_PERMISSION_DENIED: "El permiso de micrófono fue denegado. Autorízalo o ingresa la patente manualmente.",
  VOICE_NOT_UNDERSTOOD: "No se entendió una patente válida. Dicta letra por letra (ej.: \"be be ce de uno dos\") o ingrésala manualmente.",
});

export function entryErrorMessage(code) {
  return ENTRY_ERROR_MESSAGES[code] || ENTRY_ERROR_MESSAGES.UNEXPECTED;
}

// Traduce la respuesta de POST /api/data-entry (ENTRY) a un código de la
// lista de arriba -- un 409 de vehículo ya ingresado nunca se muestra como
// error genérico. 401 lo maneja el llamador (vuelve al login).
export function classifyEntryFailure(status, payload) {
  const code = payload?.details?.code || payload?.code || "";
  if (code && ENTRY_ERROR_MESSAGES[code]) return code;
  if (status === 409 && code === "") return "VEHICLE_ALREADY_INSIDE";
  if (status === 400 && payload?.details?.plate) return "INVALID_PLATE";
  if (status >= 500) return "BACKEND_UNAVAILABLE";
  return "UNEXPECTED";
}

// Aviso preventivo (no reemplaza al backend, que sigue siendo la autoridad
// con su verificación + índice único): la patente ya figura entre las
// estadías OPEN que el POS tiene cargadas para su estacionamiento.
export function isPlateAlreadyInside(plate, activeStays) {
  const wanted = normalizePlateCandidate(plate);
  if (!wanted) return false;
  return (Array.isArray(activeStays) ? activeStays : []).some((stay) => normalizePlateCandidate(stay?.license_plate) === wanted);
}
