import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { capacityMetrics, sanitizeLevelCreateInput, validateLevelCreateInput } from "./parkingOperations.mjs";

test("payload de creación ignora código y valores derivados", () => {
  assert.deepEqual(sanitizeLevelCreateInput({ name:" Nivel -2 ",status:"ACTIVE",description:"  Subterráneo ",notes:"  opcional ",code:"MAL-999",capacity:500,occupied:200,zoneCount:4 }), { name:"Nivel -2",status:"ACTIVE",description:"Subterráneo",capacity:500 });
});
test("nombre y estado son obligatorios; descripción y observaciones son opcionales", () => {
  assert.deepEqual(validateLevelCreateInput({name:"Nivel 1",status:"ACTIVE",description:"",capacity:100}),{});
  const errors=validateLevelCreateInput({name:"   ",status:""});
  assert.ok(errors.name);assert.ok(errors.status);
});
test("nivel sin zonas deriva capacidad y cantidad cero", () => {
  assert.deepEqual(capacityMetrics([]),{capacity:0,occupied:0,available:0,occupancyPercentage:0});
});
test("formulario oculta código al crear y evita doble envío", () => {
  const source=fs.readFileSync(new URL("../components/estacionamientos/StructureEntityForm.js",import.meta.url),"utf8");
  assert.match(source,/!\(kind === "level" && !editing\)/);
  assert.match(source,/disabled=\{submitting\}/);
  assert.match(source,/rows="3"/);
});
test("API genera código por RPC y no inserta código del cliente", () => {
  const api=fs.readFileSync(new URL("../app/api/estacionamientos/[id]/niveles/route.js",import.meta.url),"utf8");
  const sql=fs.readFileSync(new URL("../../supabase/migrations/20260728160000_parking_operational_structure.sql",import.meta.url),"utf8");
  assert.match(api,/createLevel\(db, input, parking\.id\)/);
  assert.doesNotMatch(api,/input\.code/);
  assert.match(sql,/create_parking_level/);
  assert.match(sql,/for update/);
  assert.match(sql,/'NIV-' \|\| lpad/);
  assert.match(sql,/unique \(parking_id, code\)/);
});
test("interfaz no expone error técnico de Supabase", () => {
  const api=fs.readFileSync(new URL("../app/api/estacionamientos/[id]/niveles/route.js",import.meta.url),"utf8");
  assert.match(api,/No fue posible crear el nivel\. Intente nuevamente o contacte al administrador\./);
  assert.doesNotMatch(api,/estructura operacional pendiente aún no está creada en Supabase/i);
});
