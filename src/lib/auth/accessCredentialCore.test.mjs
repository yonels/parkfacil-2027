import assert from "node:assert/strict";
import test from "node:test";
import { createAccessUsername, buildTechnicalEmail, createTemporaryPassword, ACCESS_USERNAME_TECHNICAL_DOMAIN } from "./accessCredentialCore.mjs";
import { validateDirectPassword } from "../userCredentialCore.mjs";

test("createAccessUsername: usa el prefijo del rol, nunca contiene @ ni espacios", () => {
  const admin = createAccessUsername("company_admin");
  const operator = createAccessUsername("operator");
  assert.match(admin, /^pfadmin[a-z0-9]+$/);
  assert.match(operator, /^pfop[a-z0-9]+$/);
  assert.doesNotMatch(admin, /[@\s]/);
  assert.doesNotMatch(operator, /[@\s]/);
});

test("createAccessUsername: dos llamadas seguidas no repiten el mismo valor (aleatorio, no secuencial)", () => {
  const a = createAccessUsername("company_admin");
  const b = createAccessUsername("company_admin");
  assert.notEqual(a, b);
});

test("buildTechnicalEmail: siempre usa el dominio técnico fijo, nunca un dominio real de la empresa", () => {
  const email = buildTechnicalEmail("pfadmin7f3k9a");
  assert.equal(email, `pfadmin7f3k9a@${ACCESS_USERNAME_TECHNICAL_DOMAIN}`);
  assert.equal(ACCESS_USERNAME_TECHNICAL_DOMAIN, "acceso.parkfacilapp.cl");
});

test("buildTechnicalEmail: normaliza a minúsculas (Supabase Auth guarda el email en minúsculas)", () => {
  assert.equal(buildTechnicalEmail("PfAdmin123"), `pfadmin123@${ACCESS_USERNAME_TECHNICAL_DOMAIN}`);
});

test("createTemporaryPassword: cumple la política real de Supabase/Auth ya validada en userCredentialCore.mjs", () => {
  for (let i = 0; i < 20; i += 1) {
    const password = createTemporaryPassword();
    assert.deepEqual(validateDirectPassword(password), [], `password generada no cumple la política: ${password}`);
  }
});

test("createTemporaryPassword: nunca es determinística (dos llamadas producen valores distintos)", () => {
  assert.notEqual(createTemporaryPassword(), createTemporaryPassword());
});
