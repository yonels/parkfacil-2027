import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { nextZoneCode, zoneDeleteBlockReason } from "../../lib/parkingOperations.mjs";

const source = () => readFile(new URL("./StructureRoute.js", import.meta.url), "utf8");

// SOL-2026-11-02-001: la página de edición de zona existía sin ningún enlace que llegara a ella.
test("el detalle del nivel enlaza a la edición de cada zona y muestra su estado", async () => {
  const src = await source();
  assert.match(src, /kind === "level" \? <div[^\n]*<EstadoEstacionamientoBadge status=\{child\.status\} \/>/);
  assert.match(src, /href=\{`\$\{base\}\/zonas\/\$\{child\.id\}\/editar`\}/);
});

// Las zonas admiten MAINTENANCE, que STATE_LABELS no incluye porque también alimenta filtros de estacionamientos.
test("el badge de estado traduce En mantenimiento", async () => {
  const src = await readFile(new URL("./EstadoEstacionamientoBadge.js", import.meta.url), "utf8");
  assert.match(src, /status === "MAINTENANCE" \? "En mantenimiento"/);
});

test("una zona con unidades ocupadas no se puede eliminar", () => {
  const reason = zoneDeleteBlockReason({ status: "INACTIVE", occupied: 1 }, { parkingStatus: "CONFIGURING", otherActiveZones: 3 });
  assert.match(reason, /unidades ocupadas/);
});

test("la última zona activa de un estacionamiento en operación no se puede eliminar", () => {
  const zone = { status: "ACTIVE", occupied: 0 };
  assert.match(zoneDeleteBlockReason(zone, { parkingStatus: "ACTIVE", otherActiveZones: 0 }), /última zona activa/);
  assert.equal(zoneDeleteBlockReason(zone, { parkingStatus: "ACTIVE", otherActiveZones: 1 }), null);
  assert.equal(zoneDeleteBlockReason(zone, { parkingStatus: "CONFIGURING", otherActiveZones: 0 }), null);
  assert.equal(zoneDeleteBlockReason({ status: "INACTIVE", occupied: 0 }, { parkingStatus: "ACTIVE", otherActiveZones: 0 }), null);
});

// SOL-2026-11-04-002: Tarifas y Niveles vuelven al configurador; código de zona automático.
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("nextZoneCode sigue al mayor ZON-nnn del nivel e ignora códigos antiguos", () => {
  assert.equal(nextZoneCode([]), "ZON-001");
  assert.equal(nextZoneCode(["GEN", "VIP"]), "ZON-001");
  assert.equal(nextZoneCode(["ZON-001", "zon-003", "GEN-9"]), "ZON-004");
  assert.equal(nextZoneCode(["ZON-999"]), "ZON-1000");
});

test("el formulario de zona no pide el código y el servidor lo asigna", async () => {
  const form = await read("./StructureEntityForm.js");
  assert.match(form, /kind === "zone" && !editing \? "Automático"/);
  assert.match(form, /readOnly=\{kind === "level" \|\| kind === "zone"\}/);
  assert.match(form, /if \(kind === "zone" && !editing\) delete validation\.code;/);
  const api = await read("../../app/api/estacionamientos/[id]/niveles/[nivelId]/zonas/route.js");
  assert.match(api, /nextZoneCode\(/);
  assert.match(api, /\{ \.\.\.input, code \}/);
  assert.match(api, /"23505"/);
});

test("crear un nivel y la lista de Niveles vuelven al configurador", async () => {
  const form = await read("./StructureEntityForm.js");
  assert.match(form, /creatingLevel \? levelsWizardReturnHref \|\| `\/estacionamientos\/\$\{parking\.code\}\/configuracion`/);
  assert.match(await source(), /kind === "level" \? `\/estacionamientos\/\$\{parking\.code\}\/configuracion`/);
});

test("crear una tarifa vuelve al configurador solo desde su pantalla; editar no", async () => {
  const manager = await read("./ParkingRatesManager.js");
  assert.match(manager, /if \(returnHrefAfterCreate && form\.mode !== "edit"\) \{/);
  assert.match(manager, /router\.push\(wizardReturnHref \|\| returnHrefAfterCreate\)/);
  const page = await read("../../app/estacionamientos/[id]/tarifas/page.js");
  assert.match(page, /returnHrefAfterCreate=\{`\/estacionamientos\/\$\{parking\.code\}\/configuracion`\}/);
  for (const path of ["./EstacionamientoDetalleAdmin.js", "../on-street-admin/OnStreetTarifasWorkspace.js", "../on-street-admin/OnStreetProjectDetail.js", "../on-street-admin/OnStreetProjectWizard.js"]) {
    assert.doesNotMatch(await read(path), /returnHrefAfterCreate/, path);
  }
});
