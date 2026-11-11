// LPR Off Street — Fase 1 (SOL-2026-11-01-001): reglas puras de las lecturas de
// patente. Sin Supabase ni Next, testeable con node --test.
//
//  - leerEventoIsapi: lectura ANPR de una cámara Hikvision (XML de ISAPI, el mismo
//    formato recibido en el banco con alertStream el 2026-11-01).
//  - normalizarPatenteLpr: «CXPY93» → «CXPY-93», el formato que exige
//    parking_stays.license_plate. Reutiliza la normalización del POS.
//  - decidirLectura: qué corresponde hacer con la lectura (sección 4 del proyecto).
//  - validarCuerpoEvento: cuerpo que manda el equipo local a POST /api/lpr/events.

import { createHash } from "node:crypto";

import { formatPlateForDisplay, isValidPosPlate, normalizePlateCandidate } from "../pos/entryPlateCore.mjs";

export const DECISIONES = Object.freeze({
  OPEN_PAID: "OPEN_PAID",
  ENTRY_NEW: "ENTRY_NEW",
  ENTRY_DUPLICATE: "ENTRY_DUPLICATE",
  EXIT_NOT_PAID: "EXIT_NOT_PAID",
  EXIT_GRACE_EXPIRED: "EXIT_GRACE_EXPIRED",
  EXIT_NO_STAY: "EXIT_NO_STAY",
  MANUAL_REQUIRED: "MANUAL_REQUIRED",
  DEVICE_DISABLED: "DEVICE_DISABLED",
});

// P4: bajo este umbral la lectura se trata como fallida (configurable por cámara).
export const CONFIANZA_MINIMA_POR_DEFECTO = 80;
// R8: pulso corto en operación normal (configurable por barrera).
export const PULSO_MS_POR_DEFECTO = 1500;
export const PLAZO_SALIDA_MINUTOS_POR_DEFECTO = 15;

const LARGO_MAXIMO_XML = 200_000;
const LARGO_MAXIMO_EXTERNAL_ID = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(valor) {
  return UUID.test(String(valor || ""));
}

/******************************************************************
 * XML ISAPI
 ******************************************************************/

function decodificarXml(texto) {
  return texto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

// Primer <tag>…</tag> (con o sin prefijo de espacio de nombres) dentro de `xml`.
function etiqueta(xml, nombre) {
  const patron = new RegExp(`<(?:[\\w-]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nombre}>`, "i");
  const encontrado = patron.exec(xml);
  return encontrado ? decodificarXml(encontrado[1]) : null;
}

function entero(valor) {
  const numero = Number.parseInt(String(valor ?? ""), 10);
  return Number.isFinite(numero) ? numero : null;
}

// Devuelve los datos útiles de un EventNotificationAlert de tipo ANPR, o null si
// el XML no es una lectura de patente (por ejemplo, los latidos videoloss).
export function leerEventoIsapi(xml) {
  const texto = String(xml ?? "");
  if (!texto || texto.length > LARGO_MAXIMO_XML) return null;

  const tipo = etiqueta(texto, "eventType");
  if (!tipo || tipo.toUpperCase() !== "ANPR") return null;

  const anpr = etiqueta(texto, "ANPR") ?? texto;
  const patente = etiqueta(anpr, "licensePlate");
  const confianza = entero(etiqueta(anpr, "confidenceLevel"));
  const fecha = etiqueta(texto, "dateTime");

  return {
    tipo: "ANPR",
    patente: patente || null,
    confianza: confianza !== null && confianza >= 0 && confianza <= 100 ? confianza : null,
    capturadaEn: fecha && !Number.isNaN(Date.parse(fecha)) ? new Date(fecha).toISOString() : null,
    canal: entero(etiqueta(texto, "channelID")),
    direccionCamara: etiqueta(anpr, "direction"),
    listaCamara: etiqueta(texto, "vehicleListName") ?? etiqueta(anpr, "vehicleListName"),
  };
}

/******************************************************************
 * PATENTE
 ******************************************************************/

// La cámara informa «No Plate» cuando no logra leer. Devuelve null si la lectura
// no calza con el formato de parking_stays (4 + 2); las motos de 5 caracteres
// quedan fuera, igual que en el POS.
export function normalizarPatenteLpr(valor) {
  const candidata = normalizePlateCandidate(valor);
  if (!candidata || candidata === "NOPLATE" || candidata === "UNKNOWN") return null;
  return isValidPosPlate(candidata) ? formatPlateForDisplay(candidata) : null;
}

/******************************************************************
 * DECISIÓN
 ******************************************************************/

function numeroEntre(valor, minimo, maximo, porDefecto) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= minimo && numero <= maximo ? numero : porDefecto;
}

export function confianzaMinima(configCamara) {
  return numeroEntre(configCamara?.min_confidence, 0, 100, CONFIANZA_MINIMA_POR_DEFECTO);
}

export function pulsoBarreraMs(configBarrera) {
  return numeroEntre(configBarrera?.pulse_ms, 100, 60000, PULSO_MS_POR_DEFECTO);
}

// Decide qué hacer con una lectura (sección 4 del proyecto). `estadiaAbierta` es
// la estadía OPEN de esa patente en el estacionamiento; `ultimaPagada`, la última
// PAID sin salida física registrada (gate_exit_at nulo).
// En la fase 1 solo la salida pagada dentro del plazo ordena abrir; la entrada
// registra la decisión y la apertura de la estadía queda para la fase 3 (POS).
export function decidirLectura({ acceso, camara, patente, confianza, estadiaAbierta = null, ultimaPagada = null, ahora = new Date() }) {
  const resultado = (decision, detalle, extra = {}) => ({ decision, detalle, abrir: false, estadiaId: null, ...extra });

  if (!camara?.enabled || camara?.health === "DISABLED") {
    return resultado(DECISIONES.DEVICE_DISABLED, "La cámara está desactivada.");
  }
  if (!acceso || acceso.enabled === false) {
    return resultado(DECISIONES.DEVICE_DISABLED, acceso ? "El acceso está desactivado." : "La cámara no tiene un acceso asignado.");
  }

  const minima = confianzaMinima(camara.config);
  if (!patente) return resultado(DECISIONES.MANUAL_REQUIRED, "La cámara no pudo leer la patente.");
  if (confianza === null || confianza === undefined || confianza < minima) {
    return resultado(DECISIONES.MANUAL_REQUIRED, `Confianza ${confianza ?? "desconocida"} bajo el mínimo de ${minima}.`);
  }

  if (acceso.direction === "IN") {
    if (estadiaAbierta) {
      return resultado(DECISIONES.ENTRY_DUPLICATE, "La patente ya tiene una estadía abierta.", { estadiaId: estadiaAbierta.id });
    }
    return resultado(DECISIONES.ENTRY_NEW, "Patente sin estadía abierta.");
  }

  if (estadiaAbierta) {
    return resultado(DECISIONES.EXIT_NOT_PAID, "La estadía está abierta y no ha sido pagada.", { estadiaId: estadiaAbierta.id });
  }
  if (ultimaPagada?.exit_at) {
    const plazo = numeroEntre(acceso.exit_grace_minutes, 0, 1440, PLAZO_SALIDA_MINUTOS_POR_DEFECTO);
    const minutos = (new Date(ahora).getTime() - new Date(ultimaPagada.exit_at).getTime()) / 60000;
    if (minutos <= plazo) {
      return resultado(DECISIONES.OPEN_PAID, "Estadía pagada dentro del plazo para salir.", { abrir: true, estadiaId: ultimaPagada.id });
    }
    return resultado(DECISIONES.EXIT_GRACE_EXPIRED, `Pagó hace ${Math.floor(minutos)} min; el plazo para salir es ${plazo} min.`, {
      estadiaId: ultimaPagada.id,
    });
  }
  return resultado(DECISIONES.EXIT_NO_STAY, "La patente no tiene una estadía en este estacionamiento.");
}

/******************************************************************
 * CUERPO DE POST /api/lpr/events Y AUTENTICACIÓN DEL EQUIPO LOCAL
 ******************************************************************/

// El equipo local manda el XML de la cámara tal cual (isapiXml) o una lectura ya
// interpretada (reading), por ejemplo una cámara de otra marca.
export function validarCuerpoEvento(cuerpo, { ahora = new Date() } = {}) {
  const error = (mensaje) => ({ ok: false, mensaje });
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return error("El cuerpo debe ser un objeto JSON.");
  if (!esUuid(cuerpo.deviceId)) return error("deviceId debe ser el UUID de la cámara.");

  const externalId = cuerpo.externalId === undefined || cuerpo.externalId === null ? null : String(cuerpo.externalId).trim();
  if (externalId !== null && (externalId.length === 0 || externalId.length > LARGO_MAXIMO_EXTERNAL_ID)) {
    return error(`externalId admite entre 1 y ${LARGO_MAXIMO_EXTERNAL_ID} caracteres.`);
  }

  let lectura;
  if (typeof cuerpo.isapiXml === "string") {
    lectura = leerEventoIsapi(cuerpo.isapiXml);
    if (!lectura) return error("isapiXml no es una lectura ANPR válida.");
  } else if (cuerpo.reading && typeof cuerpo.reading === "object") {
    const confianza = cuerpo.reading.confidence === undefined || cuerpo.reading.confidence === null ? null : Number(cuerpo.reading.confidence);
    if (confianza !== null && !(Number.isInteger(confianza) && confianza >= 0 && confianza <= 100)) {
      return error("reading.confidence debe ser un entero entre 0 y 100.");
    }
    const fecha = cuerpo.reading.capturedAt;
    if (fecha !== undefined && fecha !== null && Number.isNaN(Date.parse(fecha))) return error("reading.capturedAt no es una fecha válida.");
    lectura = {
      tipo: "ANPR",
      patente: cuerpo.reading.plate ? String(cuerpo.reading.plate).slice(0, 40) : null,
      confianza,
      capturadaEn: fecha ? new Date(fecha).toISOString() : null,
    };
  } else {
    return error("Falta isapiXml o reading.");
  }

  // Una hora inválida o futura se reemplaza por la de recepción.
  const recibida = new Date(ahora);
  const capturada = lectura.capturadaEn && new Date(lectura.capturadaEn).getTime() <= recibida.getTime() + 5 * 60000
    ? lectura.capturadaEn
    : recibida.toISOString();

  return {
    ok: true,
    datos: {
      deviceId: cuerpo.deviceId.toLowerCase(),
      externalId,
      patenteCruda: lectura.patente,
      patente: normalizarPatenteLpr(lectura.patente),
      confianza: lectura.confianza,
      capturadaEn: capturada,
      // Sin las fotos ni el XML completo: solo lo necesario para auditar.
      resumen: {
        formato: typeof cuerpo.isapiXml === "string" ? "ISAPI" : "READING",
        canal: lectura.canal ?? null,
        direccionCamara: lectura.direccionCamara ?? null,
        listaCamara: lectura.listaCamara ?? null,
      },
    },
  };
}

export function hashClaveGateway(clave) {
  return createHash("sha256").update(String(clave ?? ""), "utf8").digest("hex");
}

// «Authorization: Bearer <clave>». Claves de 32 a 200 caracteres visibles.
export function leerClaveGateway(cabecera) {
  const encontrado = /^Bearer\s+(\S{32,200})$/i.exec(String(cabecera ?? "").trim());
  return encontrado ? encontrado[1] : null;
}
