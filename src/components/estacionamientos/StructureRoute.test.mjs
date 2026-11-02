import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
