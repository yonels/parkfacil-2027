import assert from "node:assert/strict";
import test from "node:test";
import { isTechnicalEmail, shapeContactDisplay } from "./companyContactDisplayCore.mjs";

test("isTechnicalEmail: reconoce el dominio técnico fijo, nada más", () => {
  assert.equal(isTechnicalEmail("pfadmin7f3k9a@acceso.parkfacilapp.cl"), true);
  assert.equal(isTechnicalEmail("PFADMIN7F3K9A@ACCESO.PARKFACILAPP.CL"), true, "insensible a mayúsculas");
  assert.equal(isTechnicalEmail("admin@clinicaramis.cl"), false);
  assert.equal(isTechnicalEmail("inspector@parkfacil.cl"), false);
  assert.equal(isTechnicalEmail(""), false);
  assert.equal(isTechnicalEmail(null), false);
});

test("shapeContactDisplay: cuenta con usuario generado -> Usuario visible, Correo vacío, nunca expone el email técnico completo", () => {
  const result = shapeContactDisplay({ email: "pfadmin7f3k9a@acceso.parkfacilapp.cl" });
  assert.equal(result.esCorreoTecnico, true);
  assert.equal(result.usuario, "pfadmin7f3k9a");
  assert.equal(result.correo, "");
  assert.doesNotMatch(result.usuario, /@/);
});

test("shapeContactDisplay: company_admin con correo real (cuenta creada antes del modelo de usuario) -> Correo visible tal cual, sin usuario", () => {
  const result = shapeContactDisplay({ email: "admin@clinicaramis.cl" });
  assert.equal(result.esCorreoTecnico, false);
  assert.equal(result.correo, "admin@clinicaramis.cl");
  assert.equal(result.usuario, "");
});

test("shapeContactDisplay: operator con correo real se comporta igual que company_admin (misma función, sin distinción de rol)", () => {
  const result = shapeContactDisplay({ email: "operador@cliente.cl" });
  assert.equal(result.esCorreoTecnico, false);
  assert.equal(result.correo, "operador@cliente.cl");
});

test("shapeContactDisplay: operator con usuario generado -> mismo criterio que company_admin", () => {
  const result = shapeContactDisplay({ email: "pfop1a2b3c@acceso.parkfacilapp.cl" });
  assert.equal(result.esCorreoTecnico, true);
  assert.equal(result.usuario, "pfop1a2b3c");
});

test("shapeContactDisplay: sin email resuelto -> usa el fallback (correo ya existente en el contacto), nunca inventa uno", () => {
  const result = shapeContactDisplay({ email: "", fallbackCorreo: "legacy@empresa.cl" });
  assert.equal(result.esCorreoTecnico, false);
  assert.equal(result.correo, "legacy@empresa.cl");
});

test("shapeContactDisplay: sin email ni fallback -> correo vacío, no técnico (el llamador decide el mensaje 'Sin correo informado')", () => {
  const result = shapeContactDisplay({ email: "" });
  assert.equal(result.esCorreoTecnico, false);
  assert.equal(result.correo, "");
});
