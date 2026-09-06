import assert from "node:assert/strict";
import test from "node:test";

import {
  getPlateEntryPhotoByStay,
  getPlateEntryPhotoSignedUrl,
  linkPlateEntryPhoto,
  removeOrphanedPlatePhoto,
  uploadPlateEntryPhoto,
} from "./platePhotoEvidenceRepository.js";

// Fake de storage + tabla, en memoria -- mismo criterio que
// offStreetPlatePhotoSettingsRepository.test.mjs (sin red, sin Supabase real).
function createFakeDb({ uploadShouldFail = false, insertShouldFail = false } = {}) {
  const evidenceRows = [];
  const storageObjects = new Map();
  const removedPaths = [];
  return {
    evidenceRows,
    storageObjects,
    removedPaths,
    storage: {
      from(bucket) {
        assert.equal(bucket, "off-street-plate-photos");
        return {
          async upload(path, buffer) {
            if (uploadShouldFail) return { data: null, error: new Error("upload failed") };
            storageObjects.set(path, buffer);
            return { data: { path }, error: null };
          },
          async remove(paths) {
            for (const path of paths) { storageObjects.delete(path); removedPaths.push(path); }
            return { data: null, error: null };
          },
          async createSignedUrl(path, expiresInSeconds) {
            if (!storageObjects.has(path)) return { data: null, error: new Error("not found") };
            return { data: { signedUrl: `https://signed.example/${path}?exp=${expiresInSeconds}` }, error: null };
          },
        };
      },
    },
    from(table) {
      assert.equal(table, "parking_stay_evidence");
      const state = { filters: [] };
      return {
        insert(row) { state.insertRow = row; return this; },
        select() { return this; },
        eq(field, value) { state.filters.push((row) => row[field] === value); return this; },
        async single() {
          if (insertShouldFail) return { data: null, error: new Error("insert failed") };
          const record = { id: `evi-${evidenceRows.length + 1}`, created_at: new Date().toISOString(), ...state.insertRow };
          evidenceRows.push(record);
          return { data: record, error: null };
        },
        async maybeSingle() {
          const match = evidenceRows.filter((row) => state.filters.every((fn) => fn(row)))[0] || null;
          return { data: match, error: null };
        },
      };
    },
  };
}

const validBuffer = Buffer.from("fake-jpeg-bytes");

test("uploadPlateEntryPhoto: rechaza mime inválido antes de tocar el storage", async () => {
  const db = createFakeDb();
  await assert.rejects(
    () => uploadPlateEntryPhoto(db, { parkingId: "parking-a", buffer: validBuffer, mimeType: "application/pdf", sizeBytes: validBuffer.length }),
    /PLATE_PHOTO_MIME_NOT_ALLOWED/
  );
  assert.equal(db.storageObjects.size, 0);
});

test("uploadPlateEntryPhoto: el path queda bajo el parking_id, con extensión según el mime", async () => {
  const db = createFakeDb();
  const result = await uploadPlateEntryPhoto(db, { parkingId: "parking-a", buffer: validBuffer, mimeType: "image/jpeg", sizeBytes: validBuffer.length });
  assert.match(result.storagePath, /^parking-a\/[0-9a-f-]+\.jpg$/);
  assert.equal(db.storageObjects.has(result.storagePath), true);
});

test("uploadPlateEntryPhoto: fallo del bucket se reporta como PLATE_PHOTO_UPLOAD_FAILED", async () => {
  const db = createFakeDb({ uploadShouldFail: true });
  await assert.rejects(
    () => uploadPlateEntryPhoto(db, { parkingId: "parking-a", buffer: validBuffer, mimeType: "image/jpeg", sizeBytes: validBuffer.length }),
    /PLATE_PHOTO_UPLOAD_FAILED/
  );
});

test("linkPlateEntryPhoto: inserta la metadata con los IDs de tenant/estadía", async () => {
  const db = createFakeDb();
  const uploaded = await uploadPlateEntryPhoto(db, { parkingId: "parking-a", buffer: validBuffer, mimeType: "image/jpeg", sizeBytes: validBuffer.length });
  const linked = await linkPlateEntryPhoto(db, {
    companyId: "company-1", parkingId: "parking-a", parkingStayId: "stay-1",
    storagePath: uploaded.storagePath, mimeType: "image/jpeg", sizeBytes: validBuffer.length, createdBy: "user-1",
  });
  assert.ok(linked.id);
  assert.equal(db.evidenceRows[0].company_id, "company-1");
  assert.equal(db.evidenceRows[0].parking_stay_id, "stay-1");
  assert.equal(db.evidenceRows[0].type, "PLATE_ENTRY_PHOTO");
});

test("linkPlateEntryPhoto: si falla el insert, compensa borrando el objeto del bucket (no deja huérfanos)", async () => {
  const db = createFakeDb({ insertShouldFail: true });
  const uploaded = await uploadPlateEntryPhoto(db, { parkingId: "parking-a", buffer: validBuffer, mimeType: "image/jpeg", sizeBytes: validBuffer.length });
  await assert.rejects(
    () => linkPlateEntryPhoto(db, { companyId: "company-1", parkingId: "parking-a", parkingStayId: "stay-1", storagePath: uploaded.storagePath, mimeType: "image/jpeg", sizeBytes: validBuffer.length }),
    /PLATE_PHOTO_LINK_FAILED/
  );
  assert.equal(db.storageObjects.has(uploaded.storagePath), false);
  assert.deepEqual(db.removedPaths, [uploaded.storagePath]);
});

test("removeOrphanedPlatePhoto: nunca lanza aunque el path no exista", async () => {
  const db = createFakeDb();
  await assert.doesNotReject(() => removeOrphanedPlatePhoto(db, "no-such-path.jpg"));
});

test("getPlateEntryPhotoByStay: aislamiento -- una estadía nunca ve la foto de otra", async () => {
  const db = createFakeDb();
  const uploaded = await uploadPlateEntryPhoto(db, { parkingId: "parking-a", buffer: validBuffer, mimeType: "image/jpeg", sizeBytes: validBuffer.length });
  await linkPlateEntryPhoto(db, { companyId: "company-1", parkingId: "parking-a", parkingStayId: "stay-1", storagePath: uploaded.storagePath, mimeType: "image/jpeg", sizeBytes: validBuffer.length });
  assert.equal(await getPlateEntryPhotoByStay(db, "stay-2"), null);
  const found = await getPlateEntryPhotoByStay(db, "stay-1");
  assert.equal(found.storage_path, uploaded.storagePath);
});

test("getPlateEntryPhotoSignedUrl: null cuando no hay fotografía; URL firmada cuando sí", async () => {
  const db = createFakeDb();
  assert.equal(await getPlateEntryPhotoSignedUrl(db, "stay-1"), null);

  const uploaded = await uploadPlateEntryPhoto(db, { parkingId: "parking-a", buffer: validBuffer, mimeType: "image/jpeg", sizeBytes: validBuffer.length });
  await linkPlateEntryPhoto(db, { companyId: "company-1", parkingId: "parking-a", parkingStayId: "stay-1", storagePath: uploaded.storagePath, mimeType: "image/jpeg", sizeBytes: validBuffer.length });
  const signed = await getPlateEntryPhotoSignedUrl(db, "stay-1", 60);
  assert.ok(signed.url.includes(uploaded.storagePath));
  assert.ok(signed.url.includes("exp=60"));
});
