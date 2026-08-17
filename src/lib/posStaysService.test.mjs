import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { listOpenPosStays, quoteOpenPosStay } from "./posStaysService.js";

function createMockDb({ parking, stays }) {
  const calls = [];

  function queryFor(table) {
    const filters = [];

    const api = {
      select() {
        calls.push({ table, op: "select" });
        return api;
      },
      eq(field, value) {
        filters.push([field, value]);
        return api;
      },
      order(field, options) {
        calls.push({ table, op: "order", field, options, filters: [...filters] });
        if (table === "parking_stays") {
          const parkingId = filters.find(([field]) => field === "parking_id")?.[1];
          const status = filters.find(([field]) => field === "status")?.[1];
          const result = (stays || []).filter((stay) => (!parkingId || stay.parking_id === parkingId) && (!status || stay.status === status));
          return Promise.resolve({ data: result, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle() {
        calls.push({ table, op: "maybeSingle", filters: [...filters] });
        if (table === "parkings") {
          const parkingId = filters.find(([field]) => field === "id")?.[1];
          const status = filters.find(([field]) => field === "status")?.[1];
          const ok = parking && (!parkingId || parking.id === parkingId) && (!status || parking.status === status);
          return Promise.resolve({ data: ok ? parking : null, error: null });
        }

        if (table === "parking_stays") {
          const parkingId = filters.find(([field]) => field === "parking_id")?.[1];
          const stayId = filters.find(([field]) => field === "id")?.[1];
          const status = filters.find(([field]) => field === "status")?.[1];
          const stay = (stays || []).find((item) => (!parkingId || item.parking_id === parkingId) && (!stayId || item.id === stayId) && (!status || item.status === status)) || null;
          return Promise.resolve({ data: stay, error: null });
        }

        return Promise.resolve({ data: null, error: null });
      },
    };

    return api;
  }

  return {
    calls,
    from(table) {
      return queryFor(table);
    },
  };
}

test("lista solo estadías OPEN del parking asignado y usa hora servidor para cotizar", async () => {
  const fixedNow = new Date("2026-08-17T16:30:00.000Z");
  const db = createMockDb({
    parking: { id: "parking-1", name: "Parking Centro", status: "ACTIVE" },
    stays: [
      { id: "stay-1", parking_id: "parking-1", status: "OPEN", code: "ING-001", license_plate: "CXPY-93", entry_at: "2026-08-17T15:00:00.000Z" },
      { id: "stay-2", parking_id: "parking-2", status: "OPEN", code: "ING-999", license_plate: "ZZZZ-99", entry_at: "2026-08-17T15:05:00.000Z" },
      { id: "stay-3", parking_id: "parking-1", status: "PAID", code: "ING-777", license_plate: "ABCD-12", entry_at: "2026-08-17T14:00:00.000Z" },
    ],
  });

  const seen = [];
  const result = await listOpenPosStays(db, "parking-1", {
    now: fixedNow,
    quoteFn: async (_db, stay, options) => {
      seen.push({ stayId: stay.id, now: options.now });
      return {
        blocked: false,
        total: stay.id === "stay-1" ? 1800 : 2400,
        elapsedMinutes: stay.id === "stay-1" ? 90 : 120,
        rate: { name: "Tarifa real", billingMode: "EFFECTIVE_MINUTE" },
      };
    },
  });

  assert.equal(result.serverNow, fixedNow.toISOString());
  assert.equal(result.parking.id, "parking-1");
  assert.equal(result.stays.length, 1);
  assert.equal(result.stays[0].id, "stay-1");
  assert.equal(result.stays[0].quote.total, 1800);
  assert.equal(result.stays[0].quote.elapsedMinutes, 90);
  assert.deepEqual(seen, [{ stayId: "stay-1", now: fixedNow }]);
});

test("el detalle cotiza nuevamente sin mutar la permanencia", async () => {
  const fixedNow = new Date("2026-08-17T16:45:00.000Z");
  const db = createMockDb({
    parking: { id: "parking-1", name: "Parking Centro", status: "ACTIVE" },
    stays: [
      { id: "stay-1", parking_id: "parking-1", status: "OPEN", code: "ING-001", license_plate: "CXPY-93", entry_at: "2026-08-17T15:00:00.000Z" },
    ],
  });

  const result = await quoteOpenPosStay(db, "parking-1", "stay-1", {
    now: fixedNow,
    quoteFn: async (_db, stay, options) => ({
      blocked: false,
      total: 2200,
      elapsedMinutes: 105,
      rate: { name: "Tarifa real", billingMode: "EFFECTIVE_MINUTE" },
      calculatedAt: options.now.toISOString(),
      stayId: stay.id,
    }),
  });

  assert.equal(result.serverNow, fixedNow.toISOString());
  assert.equal(result.stay.id, "stay-1");
  assert.equal(result.quote.total, 2200);
  assert.equal(result.quote.calculatedAt, fixedNow.toISOString());
  assert.equal(db.calls.some((call) => call.op === "insert" || call.op === "update"), false);
});

test("la API y la UI POS quedan separadas de Webpay y no calculan minutos en el navegador", async () => {
  const [routeList, routeQuote, terminal] = await Promise.all([
    readFile(new URL("../app/api/pos/stays/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pos/stays/[stayId]/quote/route.js", import.meta.url), "utf8"),
    readFile(new URL("../components/pos/PosTerminal.js", import.meta.url), "utf8"),
  ]);

  assert.match(routeList, /authorizeOperationRequest\(/);
  assert.match(routeList, /listOpenPosStays\(/);
  assert.match(routeQuote, /quoteOpenPosStay\(/);
  assert.match(routeQuote, /requireOperationalParking\(/);
  assert.match(terminal, /VEHICULO_DETALLE/);
  assert.match(terminal, /setCurrentView\(POS_VIEWS\.VEHICULO_DETALLE\)/);
  assert.match(terminal, /role="button"/);
  assert.match(terminal, /cursor-pointer/);
  assert.match(terminal, /PAGAR/);
  assert.match(terminal, /EFECTIVO/);
  assert.match(terminal, /DÉBITO/);
  assert.match(terminal, /CRÉDITO/);
  assert.match(terminal, /Pago con tarjeta pendiente de integración TUU/);
  assert.match(terminal, /action: "EXIT"/);
  assert.match(terminal, /paymentMethod: "CASH"/);
  assert.doesNotMatch(terminal, /Date\.now\(\)/);
  assert.doesNotMatch(terminal, /getMinutesInside/);
  assert.doesNotMatch(routeList, /insert\(|update\(/);
  assert.doesNotMatch(routeQuote, /insert\(|update\(/);
});
