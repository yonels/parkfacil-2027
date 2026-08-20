import assert from "node:assert/strict";
import test from "node:test";

import { buildUserProfileUpdate, ESTADO_A_STATUS_DB } from "./userProfileUpdateCore.mjs";

test("normaliza nombre y estado a los valores reales de company_members", () => {
  const { errors, memberUpdate, phone } = buildUserProfileUpdate({
    nombreCompleto: "  Juan Pérez  ",
    estado: "pending",
  });
  assert.deepEqual(errors, []);
  assert.equal(memberUpdate.full_name, "Juan Pérez");
  assert.equal(memberUpdate.status, "invited");
  assert.equal(phone, undefined);
});

test("rechaza nombre vacío", () => {
  const { errors, memberUpdate } = buildUserProfileUpdate({ nombreCompleto: "   " });
  assert.equal(errors.length > 0, true);
  assert.equal(memberUpdate.full_name, undefined);
});

test("rechaza un estado que no exista en el mapeo", () => {
  const { errors, memberUpdate } = buildUserProfileUpdate({ estado: "banned" });
  assert.equal(errors.length > 0, true);
  assert.equal(memberUpdate.status, undefined);
});

test("solo incluye los campos realmente enviados (edición parcial)", () => {
  const { memberUpdate, phone } = buildUserProfileUpdate({ telefono: "+56 9 1234 5678" });
  assert.deepEqual(memberUpdate, {});
  assert.equal(phone, "+56 9 1234 5678");
});

test("payload vacío no produce cambios ni errores", () => {
  const { errors, memberUpdate, phone } = buildUserProfileUpdate({});
  assert.deepEqual(errors, []);
  assert.deepEqual(memberUpdate, {});
  assert.equal(phone, undefined);
});

test("el mapeo de estados cubre exactamente los tres valores usados en la UI", () => {
  assert.deepEqual(Object.keys(ESTADO_A_STATUS_DB).sort(), ["active", "inactive", "pending"]);
});

test("normaliza el correo a minúsculas y sin espacios", () => {
  const { errors, email } = buildUserProfileUpdate({ correo: "  Nuevo.Correo@Ejemplo.CL  " });
  assert.deepEqual(errors, []);
  assert.equal(email, "nuevo.correo@ejemplo.cl");
});

test("rechaza un correo con formato inválido", () => {
  const { errors, email } = buildUserProfileUpdate({ correo: "no-es-un-correo" });
  assert.equal(errors.length > 0, true);
  assert.equal(email, undefined);
});
