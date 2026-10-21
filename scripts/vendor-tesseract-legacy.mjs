/******************************************************************
 * TUU PRO2 (WebView 83): el core de tesseract.js (glue de Emscripten,
 * tesseract-core-*-lstm.js) usa sintaxis ES2021 (??=, ||=) que Chrome 83
 * no parsea -> el worker del OCR no carga ("No fue posible cargar el
 * lector de patentes"). Los archivos de public/vendor no pasan por el
 * bundler (ni por .browserslistrc), así que se transpilan aquí a ES2019
 * con el SWC que ya trae Next. Solo baja sintaxis; no cambia la lógica.
 *
 * Uso: node scripts/vendor-tesseract-legacy.mjs [versión]
 * (vendor-tesseract.mjs lo ejecuta al final). Idempotente.
 ******************************************************************/
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const require = createRequire(path.join(root, "package.json"));
const version = process.argv[2] || JSON.parse(readFileSync(path.join(root, "node_modules/tesseract.js/package.json"), "utf8")).version;
const dir = path.join(root, "public/vendor/tesseract", version);
const files = readdirSync(dir).filter((name) => /^tesseract-core-.*\.js$/.test(name));

const { loadBindings, transform } = require("next/dist/build/swc");
await loadBindings();

for (const name of files) {
  const file = path.join(dir, name);
  const source = readFileSync(file, "utf8");
  const result = await transform(source, {
    filename: name,
    isModule: false,
    sourceMaps: false,
    minify: false,
    jsc: { target: "es2019", parser: { syntax: "ecmascript" }, externalHelpers: false },
  });
  writeFileSync(file, result.code);
  console.log(`[vendor:tesseract:legacy] ${name}: ${source.length} -> ${result.code.length} bytes (ES2019)`);
}
