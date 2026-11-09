import test from "node:test";
import assert from "node:assert/strict";
import { summarizeFolios } from "./foliosCore.mjs";

const today = "2026-11-09";

test("folios suficientes y vigentes: sin avisos, en orden", () => {
  const r = summarizeFolios([{ dte: 61, disponibles: 381432, vencimiento: "2027-03-01" }, { dte: 33, disponibles: 294810, vencimiento: "2027-03-01" }, { dte: 56, disponibles: 399406, vencimiento: "2027-03-01" }, { dte: 43, disponibles: 10, vencimiento: "2027-03-01" }], today);
  assert.deepEqual(r.rows.map((x) => x.dte), [33, 61, 56]);
  assert.equal(r.worst, "ok");
  assert.equal(r.rows[0].daysLeft, 112);
  assert.equal(r.alerts.length, 0);
});

test("pocos, por vencer, agotados, vencidos o no informados", () => {
  const r = summarizeFolios([{ dte: 33, disponibles: 12, vencimiento: "2027-03-01" }, { dte: 61, disponibles: 900, vencimiento: "2026-11-30" }, { dte: 39, disponibles: 0 }], today);
  const by = Object.fromEntries(r.rows.map((x) => [x.dte, x]));
  assert.equal(by[33].level, "warn");
  assert.match(by[33].message, /quedan solo 12/);
  assert.equal(by[61].level, "warn");
  assert.match(by[61].message, /vencen en 21 día/);
  assert.equal(by[39].level, "err");
  assert.equal(by[56].level, "err", "nota de débito no informada");
  assert.equal(r.worst, "err");
  assert.deepEqual(r.alerts.map((x) => x.dte).sort(), [33, 56, 61]);
  const expired = summarizeFolios([{ dte: 33, disponibles: 500, vencimiento: "2026-11-01" }, { dte: 61, disponibles: 500, vencimiento: "2027-01-01" }, { dte: 56, disponibles: 500, vencimiento: "2027-01-01" }], today);
  assert.equal(expired.rows[0].level, "err");
  assert.match(expired.rows[0].message, /vencidos/);
});
