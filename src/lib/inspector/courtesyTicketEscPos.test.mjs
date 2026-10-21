import test from "node:test";
import assert from "node:assert/strict";
import { buildCourtesyTicketEscPos, courtesyTicketAgentPayload, courtesyTicketDateTime, courtesyTicketFolio, courtesyTicketLines } from "./courtesyTicketEscPos.mjs";

// Decodifica el texto real de un ticket ESC/POS, saltando los comandos
// (ESC/GS + parámetros) en vez de tratarlos como texto -- las secuencias
// de comando emitidas por buildCourtesyTicketEscPos son de largo fijo
// conocido (2 o 3 bytes), así que se reconocen y descartan explícitamente
// en vez de asumir ingenuamente que "todo byte imprimible es texto".
// Codificación latin1 (no CP850): decodificar es directo, cada byte >=128
// es su propio code point Unicode (String.fromCharCode ya hace eso).
function decodeTicketText(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    if (b === 0x1b) { // ESC ...
      const cmd = bytes[i + 1];
      if (cmd === 0x40) { i += 1; continue; } // ESC @ (2 bytes)
      i += 2; continue; // ESC a n / ESC E n / ESC d n (3 bytes)
    }
    if (b === 0x1d) { i += 2; continue; } // GS ! n / GS V n (3 bytes)
    if (b === 0x0a) { out += "\n"; continue; }
    out += String.fromCharCode(b);
  }
  return out;
}

test("courtesyTicketFolio: deriva un folio corto y REAL del id de la fiscalización (primeros 8 caracteres del UUID, sin guiones, mayúsculas) -- nunca un número inventado", () => {
  assert.equal(courtesyTicketFolio("a1b2c3d4-e5f6-7890-abcd-ef1234567890"), "A1B2C3D4");
  assert.equal(courtesyTicketFolio(""), "");
  assert.equal(courtesyTicketFolio(null), "");
});

test("courtesyTicketDateTime: dd/mm/aaaa + hh:mm (24h), horario de Chile", () => {
  const result = courtesyTicketDateTime("2026-08-30T18:25:00-04:00");
  assert.deepEqual(result, { date: "30/08/2026", time: "18:25" });
});

test("courtesyTicketDateTime: sin isoString, usa 'now' inyectado (nunca inventa una fecha oculta)", () => {
  // Enero = verano en Chile (UTC-03:00).
  const now = new Date("2026-01-05T09:03:00-03:00");
  assert.deepEqual(courtesyTicketDateTime(null, now), { date: "05/01/2026", time: "09:03" });
});

test("courtesyTicketLines: exactamente el formato pedido, sin información adicional -- patente en mayúsculas, fecha/hora, folio real, sin ningún campo extra", () => {
  const lines = courtesyTicketLines({ plate: "abcd12", inspectedAt: "2026-08-30T18:25:00-04:00", inspectionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
  assert.deepEqual(lines, {
    header: "PARKFACIL",
    plateLine: "PATENTE: ABCD12",
    dateTimeLine: "30/08/2026  18:25",
    title: "MULTA DE CORTESIA",
    subtitle: "TIEMPO VENCIDO",
    messageLines: ["SU TIEMPO EXPIRO Y", "ESTA EN INFRACCION"],
    folioLine: "Fiscalizacion: #A1B2C3D4",
    footer: "www.parkfacil.cl",
  });
});

test("courtesyTicketLines: reimprimir con el MISMO plate/inspectedAt/inspectionId produce EXACTAMENTE las mismas líneas -- la reimpresión nunca cambia patente, fecha/hora ni folio", () => {
  const original = { plate: "xyz789", inspectedAt: "2026-08-30T18:25:00-04:00", inspectionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" };
  assert.deepEqual(courtesyTicketLines(original), courtesyTicketLines({ ...original }));
});

test("buildCourtesyTicketEscPos: devuelve un Uint8Array no vacío que empieza con ESC @ (inicializar) -- sin comando de codepage (la MTP-II real no lo usa, ver escposCore.mjs)", () => {
  const bytes = buildCourtesyTicketEscPos({ plate: "ABCD12", inspectedAt: "2026-08-30T18:25:00-04:00", inspectionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 0);
  assert.deepEqual([...bytes.slice(0, 2)], [0x1b, 0x40], "ESC @ (init), primer comando");
});

test("buildCourtesyTicketEscPos: MULTA DE CORTESIA y TIEMPO VENCIDO usan negrita + SOLO doble alto (GS ! 0x01), nunca doble ancho (GS ! 0x11) -- evita que 'MULTA DE CORTESIA' (18 caracteres) se corte en 32 columnas", () => {
  const bytes = buildCourtesyTicketEscPos({ plate: "ABCD12", inspectedAt: "2026-08-30T18:25:00-04:00", inspectionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
  const raw = String.fromCharCode(...bytes);
  assert.ok(raw.includes("\x1d\x21\x01"), "debe existir GS ! 0x01 (doble alto, sin ancho)");
  assert.ok(!raw.includes("\x1d\x21\x11"), "nunca debe existir GS ! 0x11 (doble alto Y ancho)");
});

test("buildCourtesyTicketEscPos: termina con avance de papel + corte total (GS V 0), igual que footer() en ticketFormatter.js del agente de PC", () => {
  const bytes = buildCourtesyTicketEscPos({ plate: "ABCD12", inspectedAt: "2026-08-30T18:25:00-04:00", inspectionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
  const tail = [...bytes.slice(-3)];
  assert.deepEqual(tail, [0x1d, 0x56, 0x00], "GS V 0 (corte total) debe ser el último comando");
});

test("buildCourtesyTicketEscPos: contiene la patente, la fecha/hora y el folio reales -- decodificando de vuelta a texto plano, no hay texto inventado", () => {
  const bytes = buildCourtesyTicketEscPos({ plate: "xyz789", inspectedAt: "2026-01-15T09:05:00-03:00", inspectionId: "11112222-3333-4444-5555-666677778888" });
  const decoded = decodeTicketText(bytes);
  assert.ok(decoded.includes("PATENTE: XYZ789"));
  assert.ok(decoded.includes("15/01/2026  09:05"));
  assert.ok(decoded.includes("Fiscalizacion: #11112222"));
  assert.ok(decoded.includes("MULTA DE CORTESIA"));
  assert.ok(decoded.includes("TIEMPO VENCIDO"));
  assert.ok(decoded.includes("SU TIEMPO EXPIRO Y"));
  assert.ok(decoded.includes("ESTA EN INFRACCION"));
  assert.ok(decoded.includes("www.parkfacil.cl"));
  assert.ok(decoded.includes("PARKFACIL"));
});

test("buildCourtesyTicketEscPos: NUNCA agrega información adicional al ticket -- el texto decodificado no contiene ninguna palabra fuera del set fijo pedido", () => {
  const bytes = buildCourtesyTicketEscPos({ plate: "ABCD12", inspectedAt: "2026-08-30T18:25:00-04:00", inspectionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
  const decoded = decodeTicketText(bytes);
  const expectedWords = new Set("PARKFACIL PATENTE: ABCD12 30/08/2026 18:25 MULTA DE CORTESIA TIEMPO VENCIDO SU TIEMPO EXPIRO Y ESTA EN INFRACCION Fiscalizacion: #A1B2C3D4 www.parkfacil.cl".split(/\s+/));
  const actualWords = decoded.split(/\s+/).filter(Boolean);
  for (const word of actualWords) assert.ok(expectedWords.has(word), `palabra inesperada en el ticket (información adicional no pedida): "${word}"`);
});

// Corrección 2026-08-31: la MTP-II generaba caracteres corruptos con
// tildes al imprimir desde Android -- el ticket ahora es ASCII puro
// (ningún byte >= 128), la máxima compatibilidad ESC/POS posible. Prueba
// directa sobre los BYTES reales (no solo sobre el texto ya decodificado),
// para que una futura reintroducción de un tilde/ñ se detecte aquí mismo.
test("buildCourtesyTicketEscPos: el ticket completo es ASCII puro -- ningún byte de texto >= 128 (compatibilidad ESC/POS máxima, corrige la corrupción real detectada en la MTP-II vía Android)", () => {
  const bytes = buildCourtesyTicketEscPos({ plate: "ABCD12", inspectedAt: "2026-08-30T18:25:00-04:00", inspectionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
  const decoded = decodeTicketText(bytes); // ya excluye los bytes de comando ESC/GS, solo queda texto
  for (let i = 0; i < decoded.length; i += 1) {
    assert.ok(decoded.charCodeAt(i) < 128, `carácter no-ASCII en el ticket (posición ${i}): "${decoded[i]}" (código ${decoded.charCodeAt(i)})`);
  }
});

// --- courtesyTicketAgentPayload (corrección 2026-08-31): payload JSON
// para ParkFacil Print Agent (PC) -- mismo folio/fecha-hora que
// courtesyTicketLines/buildCourtesyTicketEscPos, una sola fuente de verdad
// para los tres transportes (pantalla, Android, PC).

test("courtesyTicketAgentPayload: type COURTESY_FINE con patente/fechaHora/folio -- exactamente el esquema que exige TICKET_SCHEMAS.COURTESY_FINE del agente de PC", () => {
  const payload = courtesyTicketAgentPayload({ plate: "abcd12", inspectedAt: "2026-08-30T18:25:00-04:00", inspectionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
  assert.deepEqual(payload, { type: "COURTESY_FINE", patente: "ABCD12", fechaHora: "30/08/2026  18:25", folio: "A1B2C3D4" });
});

test("courtesyTicketAgentPayload: mismo folio/fecha-hora que courtesyTicketLines() para los MISMOS datos -- nunca una segunda fuente de verdad que pueda divergir", () => {
  const data = { plate: "xyz789", inspectedAt: "2026-01-15T09:05:00-03:00", inspectionId: "11112222-3333-4444-5555-666677778888" };
  const payload = courtesyTicketAgentPayload(data);
  const lines = courtesyTicketLines(data);
  assert.equal(lines.folioLine, `Fiscalizacion: #${payload.folio}`);
  assert.equal(lines.dateTimeLine, payload.fechaHora);
  assert.equal(lines.plateLine, `PATENTE: ${payload.patente}`);
});

test("buildCourtesyTicketEscPos: patente distinta y folio distinto producen tickets distintos (no hay datos fijos/mock ocultos)", () => {
  const a = buildCourtesyTicketEscPos({ plate: "AAAA11", inspectedAt: "2026-08-30T18:25:00-04:00", inspectionId: "11111111-1111-1111-1111-111111111111" });
  const b = buildCourtesyTicketEscPos({ plate: "BBBB22", inspectedAt: "2026-08-30T18:25:00-04:00", inspectionId: "22222222-2222-2222-2222-222222222222" });
  assert.notDeepEqual([...a], [...b]);
});
