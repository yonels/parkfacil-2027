import assert from "node:assert/strict";
import test from "node:test";
import { rateDisplay, ticketHeaderData } from "./dataEntryPresentation.mjs";

const formatMoney = (value) => `$${Number(value)}`;

test("muestra el valor unitario de una tarifa por minuto", () => {
  assert.equal(
    rateDisplay({ name: "Segunda tarifa", billingMode: "EFFECTIVE_MINUTE", minuteAmount: 60 }, formatMoney),
    "$60 por minuto",
  );
});

test("muestra los valores del primer tramo y de los tramos siguientes", () => {
  assert.equal(
    rateDisplay({
      name: "Tarifa diurna",
      billingMode: "EXPIRED_BLOCKS",
      blocks: [
        { sequence: 2, amount: 500 },
        { sequence: 1, amount: 1_000 },
      ],
    }, formatMoney),
    "Primer tramo $1000 · Tramos siguientes $500",
  );
});

test("muestra el primer tramo cuando no existe un bloque siguiente", () => {
  assert.equal(
    rateDisplay({ billingMode: "EXPIRED_BLOCKS", blocks: [{ sequence: 1, amount: 1_000 }] }, formatMoney),
    "Primer tramo $1000",
  );
});

test("construye el encabezado fiscal del ticket desde la empresa del estacionamiento", () => {
  assert.deepEqual(ticketHeaderData({
    company_name: "Nombre comercial",
    company: {
      business_name: "Empresa de Prueba SpA",
      address: "Av. Central 123",
      district: "Santiago",
      city: "Santiago",
      rut_number: "76543210",
      rut_dv: "K",
      phone: "+56 9 1234 5678",
    },
  }, { entry_at: "2026-08-09T12:00:00.000Z" }, true), {
    businessName: "Empresa de Prueba SpA",
    address: "Av. Central 123, Santiago, Santiago",
    rut: "76543210-K",
    phone: "+56 9 1234 5678",
    issuedAt: "2026-08-09T12:00:00.000Z",
  });
});
