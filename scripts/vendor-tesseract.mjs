/******************************************************************
 * POS Entry/Exit — Fase 2: copia a public/vendor/tesseract/<versión>
 * los archivos de tesseract.js que el OCR de patentes sirve desde el
 * propio sitio (nunca desde un CDN en tiempo de ejecución).
 *
 * Uso (solo al actualizar la versión de tesseract.js):
 *   npm install -D tesseract.js@<versión> --save-exact
 *   npm run vendor:tesseract
 *
 * Origen de cada archivo:
 *   - tesseract.js (Apache-2.0): dist/tesseract.esm.min.js, dist/worker.min.js
 *   - tesseract.js-core (Apache-2.0): variantes LSTM con y sin SIMD (.js + .wasm)
 *   - @tesseract.js-data/eng (MIT; modelo tessdata Apache-2.0):
 *     4.0.0_best_int/eng.traineddata.gz -- no es dependencia del proyecto:
 *     se descarga con "npm pack" en un directorio temporal.
 ******************************************************************/
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const tesseractPkg = JSON.parse(readFileSync(path.join(root, "node_modules/tesseract.js/package.json"), "utf8"));
const corePkg = JSON.parse(readFileSync(path.join(root, "node_modules/tesseract.js-core/package.json"), "utf8"));
const LANG_PACKAGE = "@tesseract.js-data/eng@1.0.0";

const target = path.join(root, "public/vendor/tesseract", tesseractPkg.version);
mkdirSync(target, { recursive: true });

const copies = [
  ["node_modules/tesseract.js/dist/tesseract.esm.min.js", "tesseract.esm.min.js"],
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.js", "tesseract-core-simd-lstm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm", "tesseract-core-simd-lstm.wasm"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.js", "tesseract-core-lstm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm", "tesseract-core-lstm.wasm"],
];
for (const [from, to] of copies) copyFileSync(path.join(root, from), path.join(target, to));

const temp = mkdtempSync(path.join(tmpdir(), "tesseract-lang-"));
try {
  execFileSync("npm", ["pack", LANG_PACKAGE, "--pack-destination", temp], { stdio: "ignore", shell: process.platform === "win32" });
  // Rutas relativas + cwd: el tar de GNU (Git Bash) interpreta "C:\..." como host remoto.
  execFileSync("tar", ["-xzf", "tesseract.js-data-eng-1.0.0.tgz"], { cwd: temp, stdio: "ignore" });
  copyFileSync(path.join(temp, "package/4.0.0_best_int/eng.traineddata.gz"), path.join(target, "eng.traineddata.gz"));
} finally {
  rmSync(temp, { recursive: true, force: true });
}

writeFileSync(
  path.join(target, "README.md"),
  [
    `# tesseract.js ${tesseractPkg.version} (OCR local de patentes — POS)`,
    "",
    "Servido desde el propio sitio para que el OCR nunca dependa de un CDN ni",
    "envíe imágenes fuera del dispositivo. Generado por `npm run vendor:tesseract`",
    "(scripts/vendor-tesseract.mjs); no editar a mano.",
    "",
    `- tesseract.esm.min.js, worker.min.js — tesseract.js ${tesseractPkg.version} (Apache-2.0)`,
    `- tesseract-core-{simd-lstm,lstm}.{js,wasm} — tesseract.js-core ${corePkg.version} (Apache-2.0)`,
    `- eng.traineddata.gz — ${LANG_PACKAGE}, 4.0.0_best_int (MIT; modelo tessdata Apache-2.0)`,
    "",
  ].join("\n"),
);

console.log(`tesseract.js ${tesseractPkg.version} copiado a ${path.relative(root, target)}`);
