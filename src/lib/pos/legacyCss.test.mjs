import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import {
  boostSelector,
  expandIsWhere,
  isLegacySupportedSelector,
  needsLegacyCss,
  parseStylesheet,
  rebaseCssUrls,
  splitTopLevel,
  transformCssForLegacyWebView,
} from "./legacyCss.mjs";

// Compatibilidad WebView 83 (TUU PRO2): el CSS de Tailwind v4 transformado
// no debe contener nada que Chrome 83 descarte.

const B = ":not(#\\#)";
// Escalones de especificidad por capa (layerBoost): 2 por capa + subnivel.
const PROPS = 1;
const BASE = 3;
const UTIL = 7;
const UNLAYERED = 9;
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ROOT = new URL("../../../", import.meta.url);
const CHUNKS = new URL(".next/static/chunks/", ROOT);

// Detector de features que Chrome/WebView 83 no soporta (sobre CSS ya
// transformado). Devuelve la lista de problemas encontrados.
function chrome83CssIssues(css) {
  const issues = [];
  const check = (label, re) => { const m = css.match(re); if (m) issues.push(`${label}: ${m[0].slice(0, 80)}`); };
  // (^|[^\\]) excluye clases con @ escapado. Tailwind v4 escanea este archivo:
  // la palabra de la at-rule de consultas de contenedor se escribe partida
  // para no generar utilidades nuevas en el CSS global.
  check("@layer (Chrome 99)", /(^|[^\\])@layer\b/);
  check("@property (Chrome 85)", /(^|[^\\])@property\b/);
  check("consultas de contenedor (Chrome 105)", /(^|[^\\])@contain(er)\b/);
  check("@starting-style", /@starting-style\b/);
  check(":is()/:where() (Chrome 88)", /:(is|where|matches)\(/);
  check(":has() (Chrome 105)", /:has\(/);
  check("::file-selector-button (Chrome 89)", /::file-selector-button/);
  check(":focus-visible (Chrome 86)", /:focus-visible/);
  check(":-moz-*", /:-moz-/);
  check("padding/margin-inline|block shorthand (Chrome 87)", /[;{](padding|margin)-(inline|block):/);
  check("inset (Chrome 87)", /[;{]inset(-inline|-block)?(-start|-end)?:/);
  check("translate/rotate/scale individuales (Chrome 104)", /[;{](translate|rotate|scale):/);
  check("anidamiento CSS (&)", /(^|[^\\])&/);
  check("media query de rango (Chrome 104)", /@media[^{]*[<>]=?/);
  for (const node of walkRules(parseStylesheet(css))) {
    for (const selector of splitTopLevel(node.rule.selector, ",")) {
      if (!isLegacySupportedSelector(selector.trim())) issues.push(`selector no soportado: ${selector.slice(0, 80)}`);
    }
    // Colores modernos solo dentro de @supports que los detecte, o con un
    // fallback previo de la misma propiedad en la misma regla.
    const declarations = splitTopLevel(node.rule.body, ";").map((raw) => raw.split(":")[0].trim() && [raw.slice(0, raw.indexOf(":")).trim(), raw.slice(raw.indexOf(":") + 1)]).filter(Boolean);
    declarations.forEach(([prop, value], index) => {
      if (!/\b(lab|oklab|oklch|lch|color-mix)\(|rgb\(from/.test(value) || node.modernColorSupports) return;
      if (!declarations.slice(0, index).some(([previous]) => previous === prop)) issues.push(`color moderno sin fallback: ${prop}:${value.slice(0, 60)}`);
    });
  }
  return issues;
}

function* walkRules(nodes, modernColorSupports = false) {
  for (const node of nodes) {
    if (node.kind === "rule") { yield { rule: node, modernColorSupports }; continue; }
    if (node.body === null || !["media", "supports"].includes(node.name)) continue;
    const modern = modernColorSupports || (node.name === "supports" && /(lab|oklab|oklch|lch|color-mix)\(|rgb\(from/.test(node.prelude));
    yield* walkRules(parseStylesheet(node.body), modern);
  }
}

test("needsLegacyCss: solo navegadores sin cascade layers (Chrome < 99)", () => {
  assert.equal(needsLegacyCss({}), true);
  assert.equal(needsLegacyCss({ CSSLayerBlockRule: function CSSLayerBlockRule() {} }), false);
  assert.equal(needsLegacyCss(null), false);
});

test("@layer se desenvuelve y el orden de capas se emula con especificidad", () => {
  const out = transformCssForLegacyWebView("@layer theme,base,components,utilities;@layer base{table{border-collapse:collapse}}@layer utilities{.border-separate{border-collapse:separate}}table{border-collapse:collapse}");
  assert.doesNotMatch(out, /@layer/);
  assert.ok(out.includes(`table${B.repeat(BASE)}{border-collapse:collapse}`), "base");
  assert.ok(out.includes(`.border-separate${B.repeat(UTIL)}{border-collapse:separate}`), "utilities");
  assert.ok(out.includes(`table${B.repeat(UNLAYERED)}{border-collapse:collapse}`), "sin capa gana a utilities, como en navegadores modernos");
});

test("!important invierte el orden de capas", () => {
  const out = transformCssForLegacyWebView("@layer base{[hidden]{display:none!important;color:red}}.x{color:blue!important}");
  assert.ok(out.includes(`[hidden]${B.repeat(BASE)}{color:red}`));
  assert.ok(out.includes(`[hidden]${B.repeat(7)}{display:none!important}`), "important en base > important en utilities (5) > sin capa (1)");
  assert.ok(out.includes(`.x${B}{color:blue!important}`), "important sin capa: el menor (pierde contra important en capa)");
});

test(":where() de especificidad cero (space-y) sigue perdiendo contra utilidades como -mt-1", () => {
  const out = transformCssForLegacyWebView("@layer utilities{.-mt-1{margin-top:-4px}:where(.space-y-5>:not(:last-child)){margin-block-end:20px}}@layer base{abbr:where([title]){text-decoration:underline}}");
  assert.ok(out.includes(`.-mt-1${B.repeat(UTIL)}{margin-top:-4px}`));
  assert.ok(out.includes(`.space-y-5>:not(:last-child)${B.repeat(UTIL - 1)}{margin-block-end:20px}`), "un escalón bajo las utilidades");
  assert.ok(out.includes(`abbr[title]${B.repeat(BASE)}{`), "con especificidad propia fuera de :where queda en el subnivel normal");
});

test("@property se elimina y el fallback de Tailwind (@supports margin-trim/-moz-orient) se aplica sin condición", () => {
  const css = "@property --tw-x{syntax:\"*\";inherits:false;initial-value:0}@layer properties{@supports (((-webkit-hyphens:none)) and (not (margin-trim:inline))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b)))){*,:before,:after,::backdrop{--tw-x:0}}}";
  const out = transformCssForLegacyWebView(css);
  assert.equal(out, `*${B},${B}:before,${B}:after,${B}::backdrop{--tw-x:0}`, "capa properties = 1 escalón");
});

test(":is()/:where() se expanden a selectores equivalentes de Chrome 83", () => {
  assert.deepEqual(expandIsWhere(":where(select:is([multiple],[size])) optgroup"), ["select[multiple] optgroup", "select[size] optgroup"]);
  assert.deepEqual(expandIsWhere("abbr:where([title])"), ["abbr[title]"]);
  assert.deepEqual(expandIsWhere(":where(.space-y-2>:not(:last-child))"), [".space-y-2>:not(:last-child)"]);
  assert.deepEqual(expandIsWhere("input:where([type=button],[type=reset])"), ["input[type=button]", "input[type=reset]"]);
  // Variante group-* de Tailwind: X:is(:where(.group):is([open]) *) = .group[open] X
  assert.deepEqual(
    expandIsWhere(".group-open\\:rotate-180:is(:where(.group):is([open],:popover-open,:open) *)").filter(isLegacySupportedSelector),
    [".group[open] .group-open\\:rotate-180"],
  );
  // Salida de Lightning CSS con target chrome 83 (:is -> :-webkit-any).
  assert.deepEqual(
    expandIsWhere(".group-open\\:rotate-180:-webkit-any(:where(.group):-webkit-any([open],:popover-open,:open) *)").filter(isLegacySupportedSelector),
    [".group[open] .group-open\\:rotate-180"],
  );
  // Tipos incompatibles en el mismo compuesto -> no matchea nada.
  assert.deepEqual(expandIsWhere("input:where(select)"), []);
  assert.deepEqual(expandIsWhere(".a:where(input)"), ["input.a"]);
});

test("una pseudo no soportada elimina solo ese selector de la lista, no la regla", () => {
  const out = transformCssForLegacyWebView("@layer properties{*,:after,:before,::backdrop,::file-selector-button{box-sizing:border-box}.a:focus-visible{outline:0}:-moz-focusring{outline:auto}}");
  assert.equal(out, `*${B.repeat(PROPS)},${B}:after,${B}:before,${B}::backdrop{box-sizing:border-box}`);
  assert.equal(isLegacySupportedSelector(".a:not(.b .c)"), false, ":not() complejo es nivel 4 (Chrome 88)");
  assert.equal(isLegacySupportedSelector(".a:not(:last-child)"), true);
  assert.equal(isLegacySupportedSelector("li:nth-child(2 of .x)"), false);
  assert.equal(isLegacySupportedSelector("input::-webkit-inner-spin-button"), true);
  assert.equal(isLegacySupportedSelector(".x::marker"), false);
  assert.equal(isLegacySupportedSelector(".a\\:b"), true, "':' escapado en nombres de clase Tailwind");
});

test("boost antes del pseudo-elemento y en el sujeto", () => {
  assert.equal(boostSelector("::placeholder", 1), `${B}::placeholder`);
  assert.equal(boostSelector(".a > .b:hover:before", 2), `.a > .b:hover${B}${B}:before`);
  assert.equal(boostSelector(".hover\\:x:hover", 1), `.hover\\:x:hover${B}`);
  assert.equal(boostSelector("*", 0), "*");
});

test("propiedades lógicas -> físicas (LTR)", () => {
  const out = transformCssForLegacyWebView(".a{padding-inline:1px 2px;padding-block:3px;margin-inline:auto;margin-block:4px 5px;inset:0;inset-inline:6px;inset-block:7px 8px;inset-inline-start:9px;padding-inline-start:10px}");
  assert.equal(out, `.a${B.repeat(UNLAYERED)}{padding-left:1px;padding-right:2px;padding-top:3px;padding-bottom:3px;margin-left:auto;margin-right:auto;margin-top:4px;margin-bottom:5px;top:0;right:0;bottom:0;left:0;left:6px;right:6px;top:7px;bottom:8px;left:9px;padding-inline-start:10px}`);
});

test("translate/rotate/scale individuales -> transform compuesto sin herencia", () => {
  const out = transformCssForLegacyWebView("@layer utilities{._tx{--tw-translate-x:-50%;translate:var(--tw-translate-x) var(--tw-translate-y)}.rotate-180{rotate:180deg}._sc{--tw-scale-x:95%;--tw-scale-y:95%;scale:var(--tw-scale-x) var(--tw-scale-y)}}");
  assert.match(out, /^\*,:before,:after\{--pf-legacy-translate:translate\(0,0\);--pf-legacy-rotate:rotate\(0deg\);--pf-legacy-scale:scale\(1,1\);--pf-legacy-transform:translate\(0,0\)\}/);
  assert.match(out, /--pf-legacy-translate:translate\(var\(--tw-translate-x\),var\(--tw-translate-y\)\);transform:var\(--pf-legacy-translate/);
  assert.match(out, /--pf-legacy-rotate:rotate\(180deg\);transform:/);
  assert.match(out, /--tw-scale-x:0\.95;--tw-scale-y:0\.95;--pf-legacy-scale:scale\(var\(--tw-scale-x\),var\(--tw-scale-y\)\)/, "scale() de Chrome 83 no acepta %");
  assert.doesNotMatch(out, /[;{](translate|rotate|scale):/);
  assert.equal(transformCssForLegacyWebView(".a{color:red}"), `.a${B.repeat(UNLAYERED)}{color:red}`, "sin transformaciones no se agrega el reset");
});

test("dvh con fallback vh, appearance con prefijo -webkit-", () => {
  const out = transformCssForLegacyWebView("@layer utilities{.h{height:calc(100dvh - 210px)}.m{min-height:100dvh}.ap{appearance:none}}");
  assert.ok(out.includes("{height:calc(100vh - 210px);height:calc(100dvh - 210px)}"));
  assert.ok(out.includes("{min-height:100vh;min-height:100dvh}"));
  assert.ok(out.includes("{-webkit-appearance:none;appearance:none}"));
});

test("gap en flex (Chrome 84): fallback con márgenes solo si se pide", () => {
  const css = "@layer utilities{.gap-2{gap:calc(var(--spacing) * 2)}.gap-x-3{column-gap:12px}.hover\\:gap-1:hover{gap:4px}}";
  const withFallback = transformCssForLegacyWebView(css, { flexGapFallback: true });
  assert.ok(withFallback.includes(`.flex.gap-2:not(.flex-col):not(.flex-col-reverse)>*+*${B.repeat(UTIL)}`));
  assert.ok(withFallback.includes("{margin-left:calc(var(--spacing) * 2)}"));
  assert.ok(withFallback.includes(`.flex-col.gap-2>*+*${B.repeat(UTIL)}{margin-top:calc(var(--spacing) * 2)}`));
  assert.ok(withFallback.includes(`.flex.gap-2:not(.flex-col):not(.flex-col-reverse)>svg:only-child${B.repeat(UTIL)},`), "ícono + nodo de texto");
  assert.ok(withFallback.includes("{margin-right:calc(var(--spacing) * 2)}"));
  assert.ok(withFallback.includes(`.flex.gap-x-3:not(.flex-col):not(.flex-col-reverse)>*+*`));
  assert.doesNotMatch(withFallback, /\.flex-col\.gap-x-3/, "column-gap no afecta columnas");
  assert.doesNotMatch(withFallback, /\.flex\.hover/, "selectores con pseudo-clase no generan fallback");
  assert.doesNotMatch(transformCssForLegacyWebView(css, { flexGapFallback: false }), /margin-left/);
});

test("url() relativas se resuelven contra la hoja original; @font-face y @keyframes intactos", () => {
  const base = "https://pos.example/_next/static/chunks/a.css";
  assert.equal(rebaseCssUrls("src:url(../media/f.woff2)format(\"woff2\")", base), "src:url(https://pos.example/_next/static/media/f.woff2)format(\"woff2\")");
  assert.equal(rebaseCssUrls("background:url(\"data:image/svg+xml;utf8,<svg/>\")", base), "background:url(\"data:image/svg+xml;utf8,<svg/>\")");
  assert.equal(rebaseCssUrls("background:url(/icons/a.svg)", base), "background:url(/icons/a.svg)");
  const out = transformCssForLegacyWebView("@font-face{font-family:G;src:url(../media/g.woff2)}@keyframes spin{to{transform:rotate(360deg)}}", { baseUrl: base });
  assert.equal(out, "@font-face{font-family:G;src:url(https://pos.example/_next/static/media/g.woff2)}@keyframes spin{to{transform:rotate(360deg)}}");
});

test("@media y @supports se conservan con su contenido transformado", () => {
  const out = transformCssForLegacyWebView("@layer utilities{@media (min-width:40rem){.sm\\:px-4{padding-inline:16px}}.t{color:#fff9}@supports (color:color-mix(in lab, red, red)){.t{color:color-mix(in oklab, white 60%, transparent)}}}");
  assert.ok(out.includes(`@media (min-width:40rem){.sm\\:px-4${B.repeat(UTIL)}{padding-left:16px;padding-right:16px}}`));
  assert.ok(out.includes("@supports (color:color-mix(in lab, red, red)){.t"));
  assert.deepEqual(chrome83CssIssues(out), []);
});

test("el detector sí reconoce CSS incompatible (control negativo)", () => {
  const issues = chrome83CssIssues("@layer x{.a{padding-inline:1px}}.b:where(.c){translate:1px}.d{color:lab(50% 0 0)}");
  assert.ok(issues.some((issue) => issue.startsWith("@layer")));
  assert.ok(issues.some((issue) => issue.startsWith(":is()/:where()")));
  assert.ok(issues.some((issue) => issue.startsWith("translate/rotate/scale")));
  assert.ok(issues.some((issue) => issue.startsWith("color moderno sin fallback")));
});

// --- CSS / JS compilados reales (si hay build local en .next) --------------

const compiledCss = existsSync(CHUNKS) ? readdirSync(CHUNKS).filter((file) => file.endsWith(".css")) : [];

test("CSS compilado real de la app: la versión legacy no tiene features incompatibles con Chrome 83", { skip: compiledCss.length ? false : "sin build en .next" }, () => {
  for (const file of compiledCss) {
    const source = readFileSync(new URL(file, CHUNKS), "utf8");
    const out = transformCssForLegacyWebView(source, { baseUrl: `https://pos.example/_next/static/chunks/${file}` });
    assert.deepEqual(chrome83CssIssues(out), [], file);
    // Mismo número de llaves abiertas y cerradas (salida bien formada).
    assert.equal((out.match(/\{/g) || []).length, (out.match(/\}/g) || []).length, file);
    if (/@layer utilities/.test(source)) {
      assert.ok(out.includes(`*${B},${B}:before,${B}:after,${B}::backdrop{--tw-`), "fallback de @property aplicado sin condición");
      assert.ok(out.includes(`.flex${B.repeat(UTIL)}{display:flex}`), "utilidades presentes");
      assert.ok(out.includes(`.border-separate${B.repeat(UTIL)}{border-collapse:separate}`));
      assert.ok(out.includes(`table${B.repeat(UNLAYERED)}{border-collapse:collapse}`), "table global de globals.css mantiene su prioridad");
      assert.doesNotMatch(out, /url\(\.\.\//);
    }
  }
});

const buildManifestUrl = new URL(".next/build-manifest.json", ROOT);

test("JS compilado real: el runtime común (rootMainFiles) parsea en Chrome 83", { skip: existsSync(buildManifestUrl) ? false : "sin build en .next" }, () => {
  const require = createRequire(import.meta.url);
  const acorn = require("acorn");
  const manifest = JSON.parse(readFileSync(buildManifestUrl, "utf8"));
  const files = manifest.rootMainFiles || [];
  assert.ok(files.length > 0);
  const found = [];
  const visit = (node, file) => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "AssignmentExpression" && ["??=", "||=", "&&="].includes(node.operator)) found.push(`${file}: asignación lógica ${node.operator} (Chrome 85)`);
    if (node.type === "StaticBlock") found.push(`${file}: bloque static {} (Chrome 94)`);
    if (node.type === "MethodDefinition" && node.key.type === "PrivateIdentifier") found.push(`${file}: método privado (Chrome 84)`);
    if (node.type === "BinaryExpression" && node.left.type === "PrivateIdentifier") found.push(`${file}: #x in obj (Chrome 91)`);
    if (node.type === "Literal" && node.regex && /[dv]/.test(node.regex.flags)) found.push(`${file}: regex /${node.regex.flags} (Chrome 90+)`);
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (Array.isArray(value)) value.forEach((child) => visit(child, file));
      else if (value && typeof value.type === "string") visit(value, file);
    }
  };
  for (const file of files) {
    const source = readFileSync(new URL(`.next/${file}`, ROOT), "utf8");
    visit(acorn.parse(source, { ecmaVersion: "latest", sourceType: "script" }), file);
  }
  assert.deepEqual(found, [], "¿.browserslistrc incluye chrome 83 y el build es posterior?");
});

// --- Contratos de integración ------------------------------------------------

test(".browserslistrc: conserva los targets de Next 16 y agrega Chrome 83", () => {
  const lines = read("../../../.browserslistrc").split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  assert.deepEqual(lines, ["chrome 111", "edge 111", "firefox 111", "safari 16.4", "chrome 83"]);
});

test("el loader legacy está SOLO en layouts POS y solo actúa sin cascade layers", () => {
  const posLayout = read("../../app/pos/layout.js");
  const dataEntryLayout = read("../../app/data-entry/layout.js");
  const component = read("../../components/pos/LegacyWebViewCss.js");
  const loader = read("./legacyCssLoader.js");
  assert.match(posLayout, /<LegacyWebViewCss \/>/);
  assert.match(dataEntryLayout, /<LegacyWebViewCss \/>/);
  assert.doesNotMatch(read("../../app/layout.js"), /LegacyWebViewCss/, "no se carga en el layout raíz");
  assert.match(component, /^"use client";/);
  assert.match(loader, /!needsLegacyCss\(win\)\) return false;/);
  assert.match(loader, /url\.origin === win\.location\.origin && url\.pathname\.startsWith\("\/_next\/"\)/, "solo hojas propias");
  assert.doesNotMatch(loader, /setAttribute\([^)]*,\s*\)|link\.setAttribute|link\.disabled|\.remove\(\)/, "no toca los <link> que maneja React");
});

test("OCR vendorizado (public/vendor/tesseract): parsea en Chrome 83 — no pasa por el bundler", () => {
  const require = createRequire(import.meta.url);
  const acorn = require("acorn");
  const vendorRoot = new URL("public/vendor/tesseract/", ROOT);
  const found = [];
  for (const version of readdirSync(vendorRoot)) {
    const dir = new URL(`${version}/`, vendorRoot);
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".js"))) {
      const source = readFileSync(new URL(file, dir), "utf8");
      let ast = null;
      for (const sourceType of ["script", "module"]) {
        try { ast = acorn.parse(source, { ecmaVersion: "latest", sourceType }); break; } catch { ast = null; }
      }
      assert.ok(ast, `${file} no parsea`);
      const visit = (node) => {
        if (!node || typeof node.type !== "string") return;
        if (node.type === "AssignmentExpression" && ["??=", "||=", "&&="].includes(node.operator)) found.push(`${version}/${file}: ${node.operator}`);
        if (node.type === "StaticBlock") found.push(`${version}/${file}: static {}`);
        if (node.type === "MethodDefinition" && node.key.type === "PrivateIdentifier") found.push(`${version}/${file}: método privado`);
        for (const key of Object.keys(node)) {
          const value = node[key];
          if (Array.isArray(value)) value.forEach(visit);
          else if (value && typeof value.type === "string") visit(value);
        }
      };
      visit(ast);
    }
  }
  assert.deepEqual(found, [], "ejecutar scripts/vendor-tesseract-legacy.mjs");
});
