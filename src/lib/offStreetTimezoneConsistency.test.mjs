import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Defecto real encontrado en la validación Fase 5 (§18 Timezone): 3
// pantallas cliente (Operación, Recaudación, Reportes Off Street)
// redefinían su propio todayIsoSantiago() con el literal "America/Santiago"
// hardcodeado, en vez de importar la constante central
// (OPERATIONAL_TIME_ZONE, dataEntry.mjs) que ya usan los 4 *Core.mjs. No
// causaba discrepancia visible hoy (mismo valor), pero es una duplicación
// evitable -- si la zona operacional cambiara, estas 3 pantallas no lo
// seguirían automáticamente. Este test fija la corrección como regresión.
const paginas = [
  new URL("../app/operacion/page.js", import.meta.url),
  new URL("../app/recaudacion/page.js", import.meta.url),
  new URL("../app/reportes-off-street/page.js", import.meta.url),
];

test("Operación/Recaudación/Reportes Off Street importan OPERATIONAL_TIME_ZONE de dataEntry.mjs", async () => {
  for (const pagina of paginas) {
    const fuente = await readFile(pagina, "utf8");
    assert.match(
      fuente,
      /import\s*\{\s*OPERATIONAL_TIME_ZONE\s*\}\s*from\s*"@\/lib\/dataEntry\.mjs"/,
      `${pagina.pathname} no importa OPERATIONAL_TIME_ZONE`
    );
  }
});

test("todayIsoSantiago() de las 3 pantallas usa la constante importada, no el literal hardcodeado", async () => {
  for (const pagina of paginas) {
    const fuente = await readFile(pagina, "utf8");
    const inicio = fuente.indexOf("function todayIsoSantiago()");
    assert.ok(inicio > -1, `${pagina.pathname} no tiene todayIsoSantiago()`);
    const cuerpo = fuente.slice(inicio, inicio + 200);
    assert.match(cuerpo, /timeZone:\s*OPERATIONAL_TIME_ZONE/, `${pagina.pathname}: todayIsoSantiago sigue con el literal`);
    assert.doesNotMatch(cuerpo, /timeZone:\s*"America\/Santiago"/, `${pagina.pathname}: regresión, volvió al literal hardcodeado`);
  }
});
