import assert from "node:assert/strict";
import test from "node:test";

import { getPlatePhotoSettings, setPlatePhotoSettings } from "./offStreetPlatePhotoSettingsRepository.js";

// Fake mínimo del query builder de Supabase, suficiente para
// get/.eq/.maybeSingle y upsert/.select/.single -- mismo criterio que los
// demás "*Service.test.mjs" del proyecto (mock en memoria, sin red).
function createFakeDb(initialRows = []) {
  const rows = [...initialRows];
  return {
    rows,
    from(table) {
      assert.equal(table, "parking_offstreet_settings");
      const state = { filters: [] };
      return {
        select() { return this; },
        eq(field, value) { state.filters.push((row) => row[field] === value); return this; },
        async maybeSingle() {
          const match = rows.filter((row) => state.filters.every((fn) => fn(row)))[0] || null;
          return { data: match, error: null };
        },
        upsert(row) { state.upsertRow = row; return this; },
        async single() {
          const idx = rows.findIndex((row) => row.parking_id === state.upsertRow.parking_id);
          if (idx >= 0) rows[idx] = { ...rows[idx], ...state.upsertRow };
          else rows.push({ ...state.upsertRow });
          return { data: rows.find((row) => row.parking_id === state.upsertRow.parking_id), error: null };
        },
      };
    },
  };
}

test("getPlatePhotoSettings: sin fila devuelve DISABLED por defecto (compatibilidad, §12)", async () => {
  const db = createFakeDb([]);
  const settings = await getPlatePhotoSettings(db, "parking-a");
  assert.equal(settings.plateMode, "DISABLED");
  assert.equal(settings.printOnTicket, false);
});

test("getPlatePhotoSettings: devuelve la fila configurada para ESE parking", async () => {
  const db = createFakeDb([
    { parking_id: "parking-a", company_id: "company-1", plate_photo_mode: "REQUIRED", print_plate_photo_on_ticket: true, evidence_retention_days: 30 },
  ]);
  const settings = await getPlatePhotoSettings(db, "parking-a");
  assert.equal(settings.plateMode, "REQUIRED");
  assert.equal(settings.printOnTicket, true);
  assert.equal(settings.evidenceRetentionDays, 30);
});

test("aislamiento: la configuración de un parking nunca contamina a otro (multiempresa)", async () => {
  const db = createFakeDb([
    { parking_id: "parking-a", company_id: "company-1", plate_photo_mode: "REQUIRED", print_plate_photo_on_ticket: true, evidence_retention_days: null },
  ]);
  const settingsB = await getPlatePhotoSettings(db, "parking-b");
  assert.equal(settingsB.plateMode, "DISABLED");
  assert.equal(settingsB.printOnTicket, false);
});

test("setPlatePhotoSettings: crea la fila si no existía (upsert)", async () => {
  const db = createFakeDb([]);
  const saved = await setPlatePhotoSettings(db, { parkingId: "parking-a", companyId: "company-1", plateMode: "OPTIONAL", printOnTicket: false, evidenceRetentionDays: null, updatedBy: "user-1" });
  assert.equal(saved.plateMode, "OPTIONAL");
  assert.equal(db.rows.length, 1);
});

test("setPlatePhotoSettings: sobrescribe la fila existente del mismo parking", async () => {
  const db = createFakeDb([
    { parking_id: "parking-a", company_id: "company-1", plate_photo_mode: "DISABLED", print_plate_photo_on_ticket: false, evidence_retention_days: null },
  ]);
  const saved = await setPlatePhotoSettings(db, { parkingId: "parking-a", companyId: "company-1", plateMode: "REQUIRED", printOnTicket: true, evidenceRetentionDays: 90, updatedBy: "user-1" });
  assert.equal(saved.plateMode, "REQUIRED");
  assert.equal(saved.printOnTicket, true);
  assert.equal(saved.evidenceRetentionDays, 90);
  assert.equal(db.rows.length, 1);
});

test("setPlatePhotoSettings: rechaza un modo inválido sin tocar la base", async () => {
  const db = createFakeDb([]);
  await assert.rejects(
    () => setPlatePhotoSettings(db, { parkingId: "parking-a", companyId: "company-1", plateMode: "SOMETIMES", printOnTicket: false, updatedBy: "user-1" }),
    /PLATE_PHOTO_MODE_INVALID/
  );
  assert.equal(db.rows.length, 0);
});

test("setPlatePhotoSettings: rechaza una retención inválida", async () => {
  const db = createFakeDb([]);
  await assert.rejects(
    () => setPlatePhotoSettings(db, { parkingId: "parking-a", companyId: "company-1", plateMode: "OPTIONAL", printOnTicket: false, evidenceRetentionDays: 45, updatedBy: "user-1" }),
    /PLATE_PHOTO_RETENTION_INVALID/
  );
});

test("setPlatePhotoSettings: exige parkingId y companyId", async () => {
  const db = createFakeDb([]);
  await assert.rejects(
    () => setPlatePhotoSettings(db, { parkingId: null, companyId: "company-1", plateMode: "OPTIONAL" }),
    /PLATE_PHOTO_SETTINGS_MISSING_SCOPE/
  );
});
