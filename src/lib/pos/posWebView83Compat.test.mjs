import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// El PRO2 (Kozen P8 Neo) ejecuta el POS en WebView 83 (Chrome 83). Next transpila la sintaxis,
// pero no agrega métodos nuevos: un método posterior a Chrome 83 lanza TypeError en el equipo.
// QA PRO2 2026-10-19 (SOL-2026-10-11-001): Array.prototype.at() en el comprobante de pago.
const SRC = fileURLToPath(new URL("../../", import.meta.url));
const POS_PATHS = ["components/pos", "lib/pos", "lib/offStreet", "app/pos", "lib/parkingTimeBands.mjs", "lib/dataEntry.mjs", "lib/dataEntryPresentation.mjs", "lib/paymentCardType.mjs"];
const FORBIDDEN = [
  [/\.at\(-?\d/, "Array/String.prototype.at (Chrome 92)"],
  [/\.replaceAll\(/, "String.prototype.replaceAll (Chrome 85)"],
  [/Object\.hasOwn\(/, "Object.hasOwn (Chrome 93)"],
  [/structuredClone\(/, "structuredClone (Chrome 98)"],
  [/\.findLast(Index)?\(/, "Array.prototype.findLast (Chrome 97)"],
  [/\.to(Sorted|Reversed|Spliced)\(/, "Array change-by-copy (Chrome 110)"],
  [/Promise\.any\(/, "Promise.any (Chrome 85)"],
];

function files(path) {
  const full = join(SRC, path);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => files(join(path, name)));
}

test("el código del POS no usa métodos que el WebView 83 del PRO2 no tiene", () => {
  const offenders = [];
  for (const file of POS_PATHS.flatMap(files)) {
    if (!/\.(m?js)$/.test(file) || /\.test\.|testkit/.test(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const [pattern, label] of FORBIDDEN) if (pattern.test(source)) offenders.push(`${file.replace(SRC, "")}: ${label}`);
  }
  assert.deepEqual(offenders, []);
});
