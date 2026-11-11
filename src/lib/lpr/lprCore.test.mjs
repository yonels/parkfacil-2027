// LPR Off Street — Fase 1 (SOL-2026-11-01-001).
import test from "node:test";
import assert from "node:assert/strict";

import {
  confianzaMinima,
  decidirLectura,
  DECISIONES,
  hashClaveGateway,
  leerClaveGateway,
  leerEventoIsapi,
  normalizarPatenteLpr,
  pulsoBarreraMs,
  validarCuerpoEvento,
} from "./lprCore.mjs";

// Mismo esquema que el EventNotificationAlert recibido en el banco (2026-11-01,
// Hikvision DS-2CD7A26G0/P-IZS, alertStream), sin las imágenes.
const XML_ANPR = `<?xml version="1.0" encoding="UTF-8"?>
<EventNotificationAlert version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <ipAddress>192.168.1.64</ipAddress>
  <channelID>1</channelID>
  <dateTime>2026-11-01T20:12:38-03:00</dateTime>
  <activePostCount>1</activePostCount>
  <eventType>ANPR</eventType>
  <eventState>active</eventState>
  <eventDescription>ANPR</eventDescription>
  <ANPR>
    <country>255</country>
    <licensePlate>CXPY93</licensePlate>
    <line>1</line>
    <direction>unknown</direction>
    <confidenceLevel>98</confidenceLevel>
    <plateType>unknown</plateType>
    <plateColor>white</plateColor>
    <vehicleType>vehicle</vehicleType>
  </ANPR>
  <vehicleListName>whiteList</vehicleListName>
</EventNotificationAlert>`;

const XML_LATIDO = `<EventNotificationAlert><eventType>videoloss</eventType><eventState>inactive</eventState></EventNotificationAlert>`;

const CAMARA = { id: "c", enabled: true, health: "OK", config: {} };
const SALIDA = { id: "s", direction: "OUT", enabled: true, exit_grace_minutes: 15 };
const ENTRADA = { id: "e", direction: "IN", enabled: true };
const AHORA = new Date("2026-11-11T15:00:00Z");
const UUID = "11111111-1111-4111-8111-111111111111";

test("ISAPI: lee patente, confianza, hora y canal de una lectura ANPR", () => {
  const lectura = leerEventoIsapi(XML_ANPR);
  assert.equal(lectura.patente, "CXPY93");
  assert.equal(lectura.confianza, 98);
  assert.equal(lectura.capturadaEn, "2026-11-01T23:12:38.000Z");
  assert.equal(lectura.canal, 1);
  assert.equal(lectura.listaCamara, "whiteList");
});

test("ISAPI: los latidos y el XML inválido no son lecturas", () => {
  assert.equal(leerEventoIsapi(XML_LATIDO), null);
  assert.equal(leerEventoIsapi("no es xml"), null);
  assert.equal(leerEventoIsapi(""), null);
  assert.equal(leerEventoIsapi(null), null);
  assert.equal(leerEventoIsapi("<a>" + "x".repeat(200_001) + "</a>"), null);
});

test("ISAPI: «No Plate» llega como patente sin normalizar y confianza 0", () => {
  const lectura = leerEventoIsapi(XML_ANPR.replace("CXPY93", "No Plate").replace(">98<", ">0<"));
  assert.equal(lectura.patente, "No Plate");
  assert.equal(lectura.confianza, 0);
  assert.equal(normalizarPatenteLpr(lectura.patente), null);
});

test("patente: formato de parking_stays para patentes nuevas y antiguas; motos y basura quedan fuera", () => {
  assert.equal(normalizarPatenteLpr("CXPY93"), "CXPY-93");
  assert.equal(normalizarPatenteLpr("cx·py·93"), "CXPY-93");
  assert.equal(normalizarPatenteLpr("AB1234"), "AB12-34");
  assert.equal(normalizarPatenteLpr("BBB10"), null);
  assert.equal(normalizarPatenteLpr("No Plate"), null);
  assert.equal(normalizarPatenteLpr(""), null);
  assert.equal(normalizarPatenteLpr("ABCDEFG"), null);
});

test("umbral y pulso: valores por defecto y configurables dentro de rango", () => {
  assert.equal(confianzaMinima({}), 80);
  assert.equal(confianzaMinima({ min_confidence: 90 }), 90);
  assert.equal(confianzaMinima({ min_confidence: 150 }), 80);
  assert.equal(pulsoBarreraMs(undefined), 1500);
  assert.equal(pulsoBarreraMs({ pulse_ms: 3000 }), 3000);
  assert.equal(pulsoBarreraMs({ pulse_ms: 50 }), 1500);
});

test("decisión: cámara o acceso desactivados no abren", () => {
  const base = { patente: "CXPY-93", confianza: 98, ahora: AHORA };
  assert.equal(decidirLectura({ ...base, acceso: SALIDA, camara: { ...CAMARA, enabled: false, health: "DISABLED" } }).decision, DECISIONES.DEVICE_DISABLED);
  assert.equal(decidirLectura({ ...base, acceso: { ...SALIDA, enabled: false }, camara: CAMARA }).decision, DECISIONES.DEVICE_DISABLED);
  assert.equal(decidirLectura({ ...base, acceso: null, camara: CAMARA }).decision, DECISIONES.DEVICE_DISABLED);
});

test("decisión: sin patente o con confianza baja pide ingreso manual (R13, P4)", () => {
  assert.equal(decidirLectura({ acceso: SALIDA, camara: CAMARA, patente: null, confianza: 98 }).decision, DECISIONES.MANUAL_REQUIRED);
  assert.equal(decidirLectura({ acceso: SALIDA, camara: CAMARA, patente: "CXPY-93", confianza: 79 }).decision, DECISIONES.MANUAL_REQUIRED);
  assert.equal(decidirLectura({ acceso: SALIDA, camara: CAMARA, patente: "CXPY-93", confianza: null }).decision, DECISIONES.MANUAL_REQUIRED);
  const exigente = { ...CAMARA, config: { min_confidence: 99 } };
  assert.equal(decidirLectura({ acceso: SALIDA, camara: exigente, patente: "CXPY-93", confianza: 98 }).decision, DECISIONES.MANUAL_REQUIRED);
});

test("decisión de entrada: nueva o duplicada, sin abrir en la fase 1", () => {
  const nueva = decidirLectura({ acceso: ENTRADA, camara: CAMARA, patente: "CXPY-93", confianza: 98 });
  assert.equal(nueva.decision, DECISIONES.ENTRY_NEW);
  assert.equal(nueva.abrir, false);
  const duplicada = decidirLectura({ acceso: ENTRADA, camara: CAMARA, patente: "CXPY-93", confianza: 98, estadiaAbierta: { id: "x" } });
  assert.equal(duplicada.decision, DECISIONES.ENTRY_DUPLICATE);
  assert.equal(duplicada.estadiaId, "x");
});

test("decisión de salida: pagada dentro del plazo abre; abierta, vencida o sin estadía no (R1, R2, P3)", () => {
  const base = { acceso: SALIDA, camara: CAMARA, patente: "CXPY-93", confianza: 98, ahora: AHORA };
  const pagada = decidirLectura({ ...base, ultimaPagada: { id: "p", exit_at: "2026-11-11T14:50:00Z" } });
  assert.deepEqual([pagada.decision, pagada.abrir, pagada.estadiaId], [DECISIONES.OPEN_PAID, true, "p"]);

  const vencida = decidirLectura({ ...base, ultimaPagada: { id: "p", exit_at: "2026-11-11T14:30:00Z" } });
  assert.deepEqual([vencida.decision, vencida.abrir], [DECISIONES.EXIT_GRACE_EXPIRED, false]);

  const abierta = decidirLectura({ ...base, estadiaAbierta: { id: "o" }, ultimaPagada: { id: "p", exit_at: "2026-11-11T14:59:00Z" } });
  assert.deepEqual([abierta.decision, abierta.abrir], [DECISIONES.EXIT_NOT_PAID, false]);

  assert.equal(decidirLectura(base).decision, DECISIONES.EXIT_NO_STAY);
});

test("decisión de salida: el plazo es el del acceso (0 = salir al instante)", () => {
  const base = { camara: CAMARA, patente: "CXPY-93", confianza: 98, ahora: AHORA, ultimaPagada: { id: "p", exit_at: "2026-11-11T14:59:00Z" } };
  assert.equal(decidirLectura({ ...base, acceso: { ...SALIDA, exit_grace_minutes: 0 } }).decision, DECISIONES.EXIT_GRACE_EXPIRED);
  assert.equal(decidirLectura({ ...base, acceso: { ...SALIDA, exit_grace_minutes: 5 } }).decision, DECISIONES.OPEN_PAID);
});

test("cuerpo: acepta XML de la cámara o una lectura ya interpretada", () => {
  const conXml = validarCuerpoEvento({ deviceId: UUID, externalId: "cam1-0001", isapiXml: XML_ANPR }, { ahora: AHORA });
  assert.equal(conXml.ok, true);
  assert.equal(conXml.datos.patente, "CXPY-93");
  assert.equal(conXml.datos.patenteCruda, "CXPY93");
  assert.equal(conXml.datos.confianza, 98);
  assert.equal(conXml.datos.capturadaEn, "2026-11-01T23:12:38.000Z");
  assert.equal(conXml.datos.resumen.formato, "ISAPI");

  const conLectura = validarCuerpoEvento({ deviceId: UUID, reading: { plate: "AB1234", confidence: 91 } }, { ahora: AHORA });
  assert.equal(conLectura.datos.patente, "AB12-34");
  assert.equal(conLectura.datos.capturadaEn, AHORA.toISOString());
});

test("cuerpo: rechaza lo inválido y corrige horas futuras", () => {
  assert.equal(validarCuerpoEvento(null).ok, false);
  assert.equal(validarCuerpoEvento({ deviceId: "x", isapiXml: XML_ANPR }).ok, false);
  assert.equal(validarCuerpoEvento({ deviceId: UUID }).ok, false);
  assert.equal(validarCuerpoEvento({ deviceId: UUID, isapiXml: XML_LATIDO }).ok, false);
  assert.equal(validarCuerpoEvento({ deviceId: UUID, externalId: "", reading: {} }).ok, false);
  assert.equal(validarCuerpoEvento({ deviceId: UUID, reading: { plate: "AB1234", confidence: 101 } }).ok, false);
  assert.equal(validarCuerpoEvento({ deviceId: UUID, reading: { plate: "AB1234", capturedAt: "ayer" } }).ok, false);

  const futura = validarCuerpoEvento({ deviceId: UUID, reading: { plate: "AB1234", capturedAt: "2030-01-01T00:00:00Z" } }, { ahora: AHORA });
  assert.equal(futura.datos.capturadaEn, AHORA.toISOString());
});

test("equipo local: clave Bearer de 32 a 200 caracteres y hash sha256", () => {
  const clave = "k".repeat(40);
  assert.equal(leerClaveGateway(`Bearer ${clave}`), clave);
  assert.equal(leerClaveGateway("Bearer corta"), null);
  assert.equal(leerClaveGateway(clave), null);
  assert.equal(leerClaveGateway(undefined), null);
  assert.match(hashClaveGateway(clave), /^[0-9a-f]{64}$/);
  assert.notEqual(hashClaveGateway(clave), hashClaveGateway(clave + "x"));
});
