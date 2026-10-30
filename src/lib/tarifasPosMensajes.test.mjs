// Mensajes y reglas de tarifas y POS corregidos el 2026-10-29 (SOL-2026-10-29-016).
// Uso: node --test src/lib/tarifasPosMensajes.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { quoteBlockedMessage } from "./pos/quoteBlockedMessage.mjs";
import { isParkingActive, PARKING_NOT_ACTIVE } from "./parkingActiveGuard.mjs";
import { sanitizeRateInput } from "./parkingRateInput.mjs";
import { calculateScheduledParkingCharge } from "./parkingRates.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("POS: un ingreso fuera del horario de la tarifa explica la causa real", () => {
  const rate = { billingMode: "EFFECTIVE_MINUTE", minuteAmount: 35, freePeriodSeconds: 0, closingDebtEnabled: true, regularStartTime: "07:30", regularEndTime: "19:00", overnightFlatAmount: 15000 };
  const charge = calculateScheduledParkingCharge(rate, "2026-10-30T01:44:00Z", "2026-10-30T02:04:00Z");
  assert.equal(charge.valid, false);
  const message = quoteBlockedMessage({ reason: "RATE_REQUIRES_REVIEW", rateName: "Plan diurno", charge });
  assert.equal(message, "La tarifa «Plan diurno» no puede calcular esta estadía: El ingreso está fuera del horario asignado; requiere revisión.");
});

test("POS: sin tarifa vigente, sin detalle y liberada sin cobro", () => {
  assert.match(quoteBlockedMessage({ reason: "ACTIVE_RATE_NOT_FOUND" }), /No hay una tarifa vigente/);
  assert.match(quoteBlockedMessage({ reason: "NO_ACTIVE_RATE" }), /No hay una tarifa vigente/);
  assert.equal(quoteBlockedMessage({ reason: "RATE_REQUIRES_REVIEW", rateName: "X" }), "La tarifa «X» requiere revisión para calcular esta estadía.");
  assert.equal(quoteBlockedMessage({ reason: "RELEASED_NO_CHARGE" }), null);
  assert.match(quoteBlockedMessage({ reason: "BAND_GAP" }), /Revisa su configuración/);
});

test("POS: la cotización pública y el POS usan el mensaje nuevo", async () => {
  const service = await read("./parkingStayQuoteService.js");
  assert.match(service, /blockedMessage: payable \? null : quoteBlockedMessage\(/);
  const pos = await read("../components/pos/PosTerminal.js");
  assert.match(pos, /quoteView\?\.blockedMessage \|\| "No existe una tarifa activa para esta estadía\."/);
  assert.match(pos, /blockedMessage: quote\.blockedMessage \|\| null/);
});

test("Tarifas: la API sigue rechazando una tarifa nocturna sin «Fijar deuda al cierre»; el formulario la limpia al desmarcar", () => {
  const base = { billingMode: "EFFECTIVE_MINUTE", timeBandsEnabled: true, bandSets: [], overnightFlatAmount: "15000" };
  assert.equal(sanitizeRateInput({ ...base, closingDebtEnabled: false }).overnightFlatAmount, 15000);
});

test("Tarifas: tarifa activa superpuesta con mensaje propio y formulario que muestra cada error", async () => {
  const api = await read("./parkingApi.js");
  assert.match(api, /ACTIVE_RATE_VALIDITY_OVERLAP: "Ya hay otra tarifa activa en ese período/);
  const form = await read("../components/estacionamientos/ParkingRatesManager.js");
  assert.match(form, /setClosingDebtEnabled\(e\.target\.checked\)/);
  assert.match(form, /regularStartTime: "", regularEndTime: "", overnightFlatAmount: ""/);
  assert.match(form, /details\.map\(\(value\) => `• \$\{value\}`\)/);
  assert.doesNotMatch(form, /coexista junto a las demás/);
});

test("Estacionamiento no activo: no se opera ni se abren turnos", async () => {
  assert.equal(isParkingActive({ status: "ACTIVE" }), true);
  for (const status of ["DRAFT", "CONFIGURING", "READY_FOR_REVIEW", "INACTIVE", undefined]) assert.equal(isParkingActive({ status }), false, String(status));
  assert.equal(PARKING_NOT_ACTIVE.code, "PARKING_NOT_ACTIVE");
  const files = {
    "../app/api/pos/stays/route.js": /if \(!isParkingActive\(parking\)\)/,
    "../app/api/data-entry/route.js": /if \(!isParkingActive\(current\.parking\)\) return fail\(PARKING_NOT_ACTIVE\.message, 409/,
    "../app/api/pos/shift/start/route.js": /if \(!isParkingActive\(parking\)\) return NextResponse\.json/,
    "../app/api/estacionamientos/[id]/turnos/route.js": /input\.status === "OPEN" && !isParkingActive\(parking\)/,
    "../app/api/estacionamientos/[id]/turnos/[turnoId]/route.js": /if \(!isParkingActive\(parking\)\) return NextResponse\.json/,
  };
  for (const [file, pattern] of Object.entries(files)) assert.match(await read(file), pattern, file);
});
