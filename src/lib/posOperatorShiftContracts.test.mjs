import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../../supabase/migrations/20260817130000_operator_shifts_pos_traceability.sql");
const dataEntry = read("../app/api/data-entry/route.js");
const getShift = read("../app/api/pos/shift/route.js");
const startShift = read("../app/api/pos/shift/start/route.js");
const closeShift = read("../app/api/pos/shift/operator-close/route.js");

test("migración conserva históricos NULL, FK restrict e índices", () => {
  assert.match(migration, /entry_shift_id uuid null/);
  assert.match(migration, /payment_shift_id uuid null/);
  assert.equal((migration.match(/on delete restrict/g) || []).length >= 2, true);
  assert.match(migration, /parking_stays_entry_shift_idx/);
  assert.match(migration, /parking_stays_payment_shift_idx/);
  assert.doesNotMatch(migration, /on delete cascade/i);
});

test("concurrencia bloquea turno al asociar estadía y al abrir o cerrar", () => {
  assert.match(migration, /where id=new\.payment_shift_id for share/);
  assert.match(migration, /where id=p_shift_id for update/);
  assert.match(migration, /where id=v_shift\.id and status='PROGRAMMED'/);
  assert.match(migration, /operator_one_open_shift_idx|OPERATOR_SHIFT_CONFLICT/);
});

test("data-entry atribuye sólo solicitudes terminal y Webpay queda fuera", () => {
  assert.match(dataEntry, /isPosRequest \? posShift\.id : null/);
  assert.match(dataEntry, /entry_shift_id/);
  assert.match(dataEntry, /payment_shift_id/);
  const webpay = read("../../supabase/migrations/20260813100000_webpay_stay_accreditation.sql");
  assert.doesNotMatch(webpay, /payment_shift_id/);
});

test("contratos POS usan operator_shifts y cierre canónico", () => {
  assert.match(getShift, /getPosOperatorShiftState/);
  assert.match(startShift, /startPosOperatorShift/);
  assert.match(closeShift, /closePosOperatorShift/);
  assert.match(migration, /close_operator_shift/);
  for (const source of [getShift, startShift, closeShift]) {
    assert.doesNotMatch(source, /posShiftService|pos_shifts|pos_shift_closures/);
  }
});
