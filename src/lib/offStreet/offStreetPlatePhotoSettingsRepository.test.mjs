import assert from "node:assert/strict";
import test from "node:test";

import { getPlatePhotoSettings, setPlatePhotoSettings } from "./offStreetPlatePhotoSettingsRepository.js";

// Fake mínimo del query builder de Supabase, suficiente para
// get/.eq/.maybeSingle y upsert/.select/.single -- mismo criterio que los
// demás "*Service.test.mjs" del proyecto (mock en memoria, sin red).
// `simulateMissingGpsColumn` reproduce el ambiente donde la migración de
// GPS (20260906170000) todavía no se aplicó: cualquier select/upsert que
// mencione "gps_mode" falla con el código de columna inexistente de
// PostgREST -- exactamente lo que el repositorio debe tolerar con su
// fallback "legacy" (ver isMissingColumnError).
function createFakeDb(initialRows = [], { simulateMissingGpsColumn = false } = {}) {
  const rows = [...initialRows];
  return {
    rows,
    from(table) {
      assert.equal(table, "parking_offstreet_settings");
      const state = { filters: [] };
      return {
        select(fields) {
          state.selectedGps = String(fields || "").includes("gps_mode");
          return this;
        },
        eq(field, value) { state.filters.push((row) => row[field] === value); return this; },
        async maybeSingle() {
          if (simulateMissingGpsColumn && state.selectedGps) {
            return { data: null, error: { code: "42703", message: "column parking_offstreet_settings.gps_mode does not exist" } };
          }
          const match = rows.filter((row) => state.filters.every((fn) => fn(row)))[0] || null;
          return { data: match, error: null };
        },
        upsert(row) { state.upsertRow = row; return this; },
        async single() {
          if (simulateMissingGpsColumn && Object.prototype.hasOwnProperty.call(state.upsertRow, "gps_mode")) {
            return { data: null, error: { code: "42703", message: "column parking_offstreet_settings.gps_mode does not exist" } };
          }
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
  assert.equal(settings.gpsMode, "DISABLED");
});

test("getPlatePhotoSettings: devuelve la fila configurada para ESE parking, incluido gpsMode", () => {
  return (async () => {
    const db = createFakeDb([
      { parking_id: "parking-a", company_id: "company-1", plate_photo_mode: "REQUIRED", print_plate_photo_on_ticket: true, gps_mode: "REQUIRED", evidence_retention_days: 30 },
    ]);
    const settings = await getPlatePhotoSettings(db, "parking-a");
    assert.equal(settings.plateMode, "REQUIRED");
    assert.equal(settings.printOnTicket, true);
    assert.equal(settings.gpsMode, "REQUIRED");
    assert.equal(settings.evidenceRetentionDays, 30);
  })();
});

test("aislamiento: la configuración de un parking nunca contamina a otro (multiempresa)", async () => {
  const db = createFakeDb([
    { parking_id: "parking-a", company_id: "company-1", plate_photo_mode: "REQUIRED", print_plate_photo_on_ticket: true, gps_mode: "OPTIONAL", evidence_retention_days: null },
  ]);
  const settingsB = await getPlatePhotoSettings(db, "parking-b");
  assert.equal(settingsB.plateMode, "DISABLED");
  assert.equal(settingsB.printOnTicket, false);
  assert.equal(settingsB.gpsMode, "DISABLED");
});

test("setPlatePhotoSettings: crea la fila si no existía (upsert), incluido gpsMode", async () => {
  const db = createFakeDb([]);
  const saved = await setPlatePhotoSettings(db, { parkingId: "parking-a", companyId: "company-1", plateMode: "OPTIONAL", printOnTicket: false, gpsMode: "OPTIONAL", evidenceRetentionDays: null, updatedBy: "user-1" });
  assert.equal(saved.plateMode, "OPTIONAL");
  assert.equal(saved.gpsMode, "OPTIONAL");
  assert.equal(db.rows.length, 1);
});

test("setPlatePhotoSettings: sobrescribe la fila existente del mismo parking", async () => {
  const db = createFakeDb([
    { parking_id: "parking-a", company_id: "company-1", plate_photo_mode: "DISABLED", print_plate_photo_on_ticket: false, gps_mode: "DISABLED", evidence_retention_days: null },
  ]);
  const saved = await setPlatePhotoSettings(db, { parkingId: "parking-a", companyId: "company-1", plateMode: "REQUIRED", printOnTicket: true, gpsMode: "REQUIRED", evidenceRetentionDays: 90, updatedBy: "user-1" });
  assert.equal(saved.plateMode, "REQUIRED");
  assert.equal(saved.printOnTicket, true);
  assert.equal(saved.gpsMode, "REQUIRED");
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

// ---- Ajuste final: dependencia estricta -- GPS no puede quedar activo si la foto está DISABLED (§5) ----

test("setPlatePhotoSettings: plateMode DISABLED fuerza gpsMode a DISABLED aunque se envíe otra cosa", async () => {
  const db = createFakeDb([]);
  const saved = await setPlatePhotoSettings(db, { parkingId: "parking-a", companyId: "company-1", plateMode: "DISABLED", printOnTicket: false, gpsMode: "REQUIRED", updatedBy: "user-1" });
  assert.equal(saved.gpsMode, "DISABLED");
});

test("setPlatePhotoSettings: plateMode OPTIONAL/REQUIRED respeta el gpsMode enviado", async () => {
  const db = createFakeDb([]);
  const saved = await setPlatePhotoSettings(db, { parkingId: "parking-a", companyId: "company-1", plateMode: "OPTIONAL", printOnTicket: false, gpsMode: "OPTIONAL", updatedBy: "user-1" });
  assert.equal(saved.gpsMode, "OPTIONAL");
});

test("setPlatePhotoSettings: rechaza un gpsMode inválido", async () => {
  const db = createFakeDb([]);
  await assert.rejects(
    () => setPlatePhotoSettings(db, { parkingId: "parking-a", companyId: "company-1", plateMode: "OPTIONAL", printOnTicket: false, gpsMode: "A_VECES", updatedBy: "user-1" }),
    /PLATE_PHOTO_GPS_MODE_INVALID/
  );
});

// ---- Ajuste final: migración de GPS pendiente nunca rompe la configuración existente ----

test("getPlatePhotoSettings: sin la columna gps_mode (migración pendiente) cae a DISABLED sin lanzar", async () => {
  const db = createFakeDb(
    [{ parking_id: "parking-a", company_id: "company-1", plate_photo_mode: "REQUIRED", print_plate_photo_on_ticket: true, evidence_retention_days: null }],
    { simulateMissingGpsColumn: true }
  );
  const settings = await getPlatePhotoSettings(db, "parking-a");
  assert.equal(settings.plateMode, "REQUIRED");
  assert.equal(settings.gpsMode, "DISABLED");
});

test("setPlatePhotoSettings: sin la columna gps_mode (migración pendiente) igual guarda el resto de la configuración", async () => {
  const db = createFakeDb([], { simulateMissingGpsColumn: true });
  const saved = await setPlatePhotoSettings(db, { parkingId: "parking-a", companyId: "company-1", plateMode: "OPTIONAL", printOnTicket: true, gpsMode: "REQUIRED", updatedBy: "user-1" });
  assert.equal(saved.plateMode, "OPTIONAL");
  assert.equal(saved.printOnTicket, true);
  assert.equal(saved.gpsMode, "DISABLED");
  assert.equal(db.rows.length, 1);
});
