import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildAgentEntryTicketPayload, companyTicketFields, formatRut, formatTicketDateTime, ticketPlate } from "./entryTicketPayload.mjs";
import { fitTicketRasterSize, rgbaToMonochromeRaster, TICKET_RASTER_MAX_WIDTH } from "./ticketPhotoRaster.mjs";

// POS Entry/Exit — ticket de entrada PT-210: payload del agente (datos de
// empresa desde el parking de la estadía) y raster de la foto.

const COMPANY_A = { business_name: "Clínica Ramis SpA", rut_number: "76123456", rut_dv: "7", address: "Av. Ejemplo 1234", district: "Providencia", city: "Santiago", phone: "+56 2 2345 6789" };
const COMPANY_B = { business_name: "Inmobiliaria 5Q Ltda.", rut_number: "77.987.654", rut_dv: "k", address: "Calle Dos 200", district: "", city: "Temuco", phone: "+56 45 211 2233" };

const stay = (overrides = {}) => ({
  code: "ING-260925144059-AB12",
  license_plate: "PTCL-21",
  qr_token: "ec7a4bb0-a4f2-40cf-a3c0-3100bba8ed52",
  entry_at: "2026-09-25T14:40:59.123Z",
  entry_operator_name: "Operador Fase 5 E2E",
  ...overrides,
});
const parking = (company, overrides = {}) => ({ id: "p1", name: "Fase 5 E2E - Clínica Ramis", code: "FASE5-A", company_name: "Nombre en parking", company, ...overrides });

test("1-4. empresa dinámica: razón social, RUT, dirección y teléfono desde parking.company", () => {
  const payload = buildAgentEntryTicketPayload(stay(), parking(COMPANY_A));
  assert.equal(payload.razonSocial, "Clínica Ramis SpA");
  assert.equal(payload.rut, "76.123.456-7");
  assert.equal(payload.direccion, "Av. Ejemplo 1234, Providencia, Santiago");
  assert.equal(payload.telefono, "+56 2 2345 6789");
});

test("5. campos de empresa null/vacíos se omiten del payload (el agente no imprime etiquetas vacías)", () => {
  const payload = buildAgentEntryTicketPayload(stay(), parking({ business_name: "Solo Nombre", rut_number: "", rut_dv: null, address: "  ", district: "", city: undefined, phone: "" }));
  assert.equal(payload.razonSocial, "Solo Nombre");
  for (const key of ["rut", "direccion", "telefono"]) assert.equal(key in payload, false, `${key} no debe viajar vacío`);
  const noCompany = buildAgentEntryTicketPayload(stay(), parking(null, { company_name: "" }));
  for (const key of ["razonSocial", "rut", "direccion", "telefono"]) assert.equal(key in noCompany, false);
});

test("RUT: formato con puntos y DV; datos inválidos -> se omite", () => {
  assert.equal(formatRut("76123456", "7"), "76.123.456-7");
  assert.equal(formatRut("77.987.654", "k"), "77.987.654-K");
  assert.equal(formatRut("9876543", "0"), "9.876.543-0");
  assert.equal(formatRut("", "7"), undefined);
  assert.equal(formatRut("76123456", ""), undefined);
  assert.equal(formatRut("76123456", "X"), undefined);
});

test("6/7. fecha y hora en una sola línea con segundos, hora de Chile (servidor), sin 'Hora:'", () => {
  assert.equal(formatTicketDateTime("2026-09-25T14:40:59.123Z"), "25-09-2026 11:40:59");
  const payload = buildAgentEntryTicketPayload(stay(), parking(COMPANY_A));
  assert.equal(payload.fechaHoraIngreso, "25-09-2026 11:40:59");
  assert.equal("horaIngreso" in payload, false);
  assert.equal(formatTicketDateTime("no-es-fecha"), undefined);
});

test("8. operador incluido; patente normalizada; ticket y QR reales de la estadía", () => {
  const payload = buildAgentEntryTicketPayload(stay(), parking(COMPANY_A));
  assert.equal(payload.operador, "Operador Fase 5 E2E");
  assert.equal(payload.patente, "PTCL21");
  assert.equal(payload.ticketNumber, "ING-260925144059-AB12");
  assert.equal(payload.qrValue, "ec7a4bb0-a4f2-40cf-a3c0-3100bba8ed52");
  assert.equal(ticketPlate("ab·1234"), "AB1234");
});

test("no repite nombre ni código del parking en el ticket del cliente", () => {
  const payload = buildAgentEntryTicketPayload(stay(), parking(COMPANY_A));
  assert.equal("parkingName" in payload, false);
  assert.equal("parkingCode" in payload, false);
  assert.doesNotMatch(JSON.stringify(payload), /FASE5-A/);
});

test("sin datos mínimos (patente/ticket/QR/fecha) no se arma un ticket incompleto", () => {
  assert.equal(buildAgentEntryTicketPayload(stay({ qr_token: "" }), parking(COMPANY_A)), null);
  assert.equal(buildAgentEntryTicketPayload(stay({ entry_at: null }), parking(COMPANY_A)), null);
  assert.equal(buildAgentEntryTicketPayload(stay({ code: "" }), parking(COMPANY_A)), null);
});

test("29-32. multiempresa: cada ticket toma SOLO la empresa de su propio parking", () => {
  const a = buildAgentEntryTicketPayload(stay(), parking(COMPANY_A));
  const b = buildAgentEntryTicketPayload(stay(), parking(COMPANY_B));
  assert.equal(b.razonSocial, "Inmobiliaria 5Q Ltda.");
  assert.equal(b.rut, "77.987.654-K");
  assert.equal(b.direccion, "Calle Dos 200, Temuco");
  for (const key of ["razonSocial", "rut", "direccion", "telefono"]) assert.notEqual(a[key], b[key]);
  assert.deepEqual(companyTicketFields(parking(COMPANY_A)), companyTicketFields(parking(COMPANY_A)));
});

test("33/34. sin company[0]/parking[0] ni datos de QA hardcodeados en el código", () => {
  const source = readFileSync(new URL("./entryTicketPayload.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\[0\]/);
  assert.doesNotMatch(source, /Ramis|FASE5|76\.123|Operador Fase|2345 6789|parkfacilapp/i);
});

// ---- Raster de la foto ----

test("raster: máximo 384 dots de ancho, proporción preservada, nunca se agranda", () => {
  assert.deepEqual(fitTicketRasterSize(900, 325), { width: 384, height: 139 });
  assert.deepEqual(fitTicketRasterSize(200, 100), { width: 200, height: 100 });
  const tall = fitTicketRasterSize(900, 900);
  assert.ok(tall.width <= TICKET_RASTER_MAX_WIDTH && tall.height <= 240);
  assert.equal(Math.round((tall.width / tall.height) * 100), 100);
  assert.equal(fitTicketRasterSize(0, 10), null);
});

test("raster: monocromo 1 bit por punto (negro=1), filas empaquetadas en bytes", () => {
  const width = 10;
  const height = 2;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const black = i < width; // primera fila negra, segunda blanca
    rgba.set(black ? [0, 0, 0, 255] : [255, 255, 255, 255], i * 4);
  }
  const raster = rgbaToMonochromeRaster(rgba, width, height);
  assert.equal(raster.widthBytes, 2);
  assert.equal(raster.bitmap.length, 4);
  assert.deepEqual([...raster.bitmap], [0xff, 0xc0, 0x00, 0x00]);
});
