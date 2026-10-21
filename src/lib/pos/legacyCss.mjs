// POS en WebView antiguo (TUU PRO2: Android 11, Android System WebView 83).
//
// Tailwind v4 compila a CSS moderno que Chrome 83 no entiende. El caso crítico
// es @layer (Chrome 99+): Chrome 83 descarta los bloques @layer completos, y
// con ellos TODAS las utilidades, así que la pantalla queda sin estilos.
// Además usa @property (85), :is()/:where() (88), shorthands lógicos
// padding/margin-inline|block e inset (87), translate/rotate/scale
// individuales (104), appearance sin prefijo (84), gap en flex (84), dvh (108)
// y pseudo-clases que invalidan listas completas de selectores
// (::file-selector-button, :focus-visible, :popover-open, :-moz-*).
//
// Este módulo transforma ese CSS compilado (el MISMO que usa el resto de la
// app) a un equivalente que Chrome 83 aplica. Es puro (sin DOM) para poder
// testearlo contra el CSS real de .next. Solo lo ejecuta el loader de POS y
// solo cuando el navegador no soporta @layer: los navegadores modernos nunca
// pasan por aquí.
//
// Cascada: sin @layer, el orden entre capas se emula con especificidad
// (técnica de postcss-cascade-layers): cada selector recibe N veces
// `:not(#\#)` según su capa (theme/properties < base < components <
// utilities < sin capa), con un subnivel inferior para los :where() de
// especificidad cero. Para !important el orden de capas se invierte, igual
// que en la especificación. Ver layerBoost().

const BOOST = ":not(#\\#)";
const LAYER_RANK = Object.freeze({ properties: 0, theme: 0, base: 1, components: 2, utilities: 3 });
const UNKNOWN_LAYER_RANK = 3;
export const UNLAYERED_RANK = 4;

const NESTED_RULE_AT_RULES = new Set(["media", "supports", "layer"]);

// Pseudo-clases / pseudo-elementos que Chrome 83 reconoce. Un selector con
// cualquier otra pseudo invalida la lista completa en Chrome 83, así que se
// descarta solo ese selector (el resto de la lista sobrevive).
const SUPPORTED_PSEUDO_CLASSES = new Set([
  "active", "any-link", "checked", "default", "defined", "disabled", "empty", "enabled", "first",
  "first-child", "first-of-type", "focus", "focus-within", "fullscreen", "host", "hover",
  "in-range", "indeterminate", "invalid", "lang", "last-child", "last-of-type", "left", "link",
  "not", "nth-child", "nth-last-child", "nth-last-of-type", "nth-of-type", "only-child",
  "only-of-type", "optional", "out-of-range", "placeholder-shown", "read-only", "read-write",
  "required", "right", "root", "scope", "target", "valid", "visited", "-webkit-autofill",
  "-webkit-any",
]);
const LEGACY_PSEUDO_ELEMENTS = new Set(["before", "after", "first-line", "first-letter"]);
const SUPPORTED_PSEUDO_ELEMENTS = new Set([...LEGACY_PSEUDO_ELEMENTS, "placeholder", "selection", "backdrop"]);

// ---------------------------------------------------------------------------
// Escaneo léxico mínimo: comentarios, strings, escapes, paréntesis/corchetes.

function skipComment(text, index) {
  const end = text.indexOf("*/", index + 2);
  return end < 0 ? text.length : end + 2;
}

function skipString(text, index) {
  const quote = text[index];
  let i = index + 1;
  while (i < text.length && text[i] !== quote) i += text[i] === "\\" ? 2 : 1;
  return i + 1;
}

// Recorre `text` llamando a visit(char, index, depth) solo para caracteres de
// nivel superior (fuera de strings/comentarios/escapes). depth cuenta ( y [.
function scanTopLevel(text, visit) {
  let depth = 0;
  for (let i = 0; i < text.length;) {
    const char = text[i];
    if (char === "\\") { i += 2; continue; }
    if (char === "\"" || char === "'") { i = skipString(text, i); continue; }
    if (char === "/" && text[i + 1] === "*") { i = skipComment(text, i); continue; }
    if (char === "(" || char === "[") { if (visit(char, i, depth) === false) return; depth += 1; i += 1; continue; }
    if (char === ")" || char === "]") { depth = Math.max(0, depth - 1); if (visit(char, i, depth) === false) return; i += 1; continue; }
    if (visit(char, i, depth) === false) return;
    i += 1;
  }
}

export function splitTopLevel(text, separator) {
  const parts = [];
  let start = 0;
  scanTopLevel(text, (char, index, depth) => {
    if (depth === 0 && char === separator) { parts.push(text.slice(start, index)); start = index + 1; }
  });
  parts.push(text.slice(start));
  return parts;
}

function splitWhitespace(value) {
  const parts = [];
  let start = 0;
  scanTopLevel(value, (char, index, depth) => {
    if (depth === 0 && /\s/.test(char)) { parts.push(value.slice(start, index)); start = index + 1; }
  });
  parts.push(value.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function findMatchingParen(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length;) {
    const char = text[i];
    if (char === "\\") { i += 2; continue; }
    if (char === "\"" || char === "'") { i = skipString(text, i); continue; }
    if (char === "(") depth += 1;
    else if (char === ")") { depth -= 1; if (depth === 0) return i; }
    i += 1;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Parser de hoja de estilos (reglas, at-rules con o sin bloque).

function findBlockEnd(css, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < css.length;) {
    const char = css[i];
    if (char === "\\") { i += 2; continue; }
    if (char === "\"" || char === "'") { i = skipString(css, i); continue; }
    if (char === "/" && css[i + 1] === "*") { i = skipComment(css, i); continue; }
    if (char === "{") depth += 1;
    else if (char === "}") { depth -= 1; if (depth === 0) return i; }
    i += 1;
  }
  return css.length;
}

export function parseStylesheet(css) {
  const nodes = [];
  let i = 0;
  let preludeStart = 0;
  while (i < css.length) {
    const char = css[i];
    if (char === "\\") { i += 2; continue; }
    if (char === "\"" || char === "'") { i = skipString(css, i); continue; }
    if (char === "/" && css[i + 1] === "*") {
      const end = skipComment(css, i);
      if (!css.slice(preludeStart, i).trim()) preludeStart = end;
      i = end;
      continue;
    }
    if (char === "(" ) { const close = findMatchingParen(css, i); i = close < 0 ? css.length : close + 1; continue; }
    if (char === ";" || char === "{" || char === "}") {
      const prelude = css.slice(preludeStart, i).trim();
      if (char === "}") { i += 1; preludeStart = i; continue; }
      if (char === ";") {
        if (prelude.startsWith("@")) nodes.push(atNode(prelude, null));
        i += 1;
        preludeStart = i;
        continue;
      }
      const end = findBlockEnd(css, i);
      const body = css.slice(i + 1, end);
      nodes.push(prelude.startsWith("@") ? atNode(prelude, body) : { kind: "rule", selector: prelude, body });
      i = end + 1;
      preludeStart = i;
      continue;
    }
    i += 1;
  }
  return nodes;
}

function atNode(prelude, body) {
  const match = /^@([-\w]+)\s*([\s\S]*)$/.exec(prelude);
  return { kind: "at", name: match ? match[1].toLowerCase() : "", prelude: match ? match[2].trim() : "", body };
}

// ---------------------------------------------------------------------------
// Selectores.

function isCombinator(char) {
  return char === ">" || char === "+" || char === "~" || /\s/.test(char);
}

// Índice donde empieza el último compuesto (después del último combinador).
function lastCompoundStart(selector) {
  let start = 0;
  scanTopLevel(selector, (char, index, depth) => {
    if (depth === 0 && isCombinator(char)) start = index + 1;
  });
  return start;
}

function hasTopLevelCombinator(selector) {
  let found = false;
  scanTopLevel(selector.trim(), (char, index, depth) => {
    if (depth === 0 && isCombinator(char)) { found = true; return false; }
    return undefined;
  });
  return found;
}

function leadingType(compound) {
  const match = /^(\*|[a-zA-Z][-\w]*)/.exec(compound);
  return match ? match[1] : "";
}

// Une dos compuestos que deben cumplirse sobre el mismo elemento.
function mergeCompounds(first, second) {
  const typeA = leadingType(first);
  const typeB = leadingType(second);
  const realA = typeA && typeA !== "*" ? typeA : "";
  const realB = typeB && typeB !== "*" ? typeB : "";
  if (realA && realB && realA.toLowerCase() !== realB.toLowerCase()) return null;
  const merged = (realA || realB) + first.slice(typeA.length) + second.slice(typeB.length);
  return merged || "*";
}

function findFunctionalPseudo(selector, names) {
  let found = null;
  scanTopLevel(selector, (char, index, depth) => {
    if (depth !== 0 || char !== ":" || selector[index - 1] === ":") return undefined;
    const match = /^:([-\w]+)\(/.exec(selector.slice(index));
    if (!match || !names.includes(match[1].toLowerCase())) return undefined;
    const open = index + match[0].length - 1;
    const close = findMatchingParen(selector, open);
    if (close < 0) return undefined;
    found = { start: index, open, close };
    return false;
  });
  return found;
}

// Reemplaza `prefix:is(arg)suffix` por la alternativa equivalente sin :is().
function substituteAlternative(prefix, arg, suffix) {
  if (!arg) return null;
  const compoundStart = lastCompoundStart(prefix);
  const before = prefix.slice(0, compoundStart);
  const compound = prefix.slice(compoundStart);
  if (!hasTopLevelCombinator(arg)) {
    const merged = mergeCompounds(compound, arg);
    return merged === null ? null : before + merged + suffix;
  }
  // `X:is(A B)` = X descendiente de A: solo es reescribible si X es el primer
  // compuesto del selector (patrón de las variantes group-*/peer-* de Tailwind).
  if (before.trim()) return null;
  const argLastStart = lastCompoundStart(arg);
  const merged = mergeCompounds(arg.slice(argLastStart), compound);
  return merged === null ? null : arg.slice(0, argLastStart) + merged + suffix;
}

const MAX_ALTERNATIVES = 64;

// Con target chrome 83, Lightning CSS reescribe :is() como :-webkit-any(),
// que no admite combinadores: también se expande.
const EXPANDABLE_PSEUDOS = ["is", "where", "matches", "-webkit-any"];

export function expandIsWhere(selector, depth = 0) {
  const found = findFunctionalPseudo(selector, EXPANDABLE_PSEUDOS);
  if (!found) return [selector];
  if (depth > 8) return [];
  const prefix = selector.slice(0, found.start);
  const suffix = selector.slice(found.close + 1);
  const results = [];
  for (const rawArg of splitTopLevel(selector.slice(found.open + 1, found.close), ",")) {
    const combined = substituteAlternative(prefix, rawArg.trim(), suffix);
    if (combined) results.push(...expandIsWhere(combined, depth + 1));
    if (results.length >= MAX_ALTERNATIVES) break;
  }
  return results.slice(0, MAX_ALTERNATIVES);
}

function isSimpleSelector(text) {
  const value = text.trim();
  if (!value || hasTopLevelCombinator(value) || splitTopLevel(value, ",").length > 1) return false;
  let starts = 0;
  scanTopLevel(value, (char, index, depth) => {
    if (depth === 0 && (char === "." || char === "#" || char === "[" || (char === ":" && value[index - 1] !== ":"))) starts += 1;
  });
  if (/^(\*|[a-zA-Z])/.test(value)) starts += 1;
  return starts === 1 && isLegacySupportedSelector(value);
}

// true si Chrome 83 acepta el selector (pseudos conocidas, :not() de nivel 3,
// sin anidamiento &).
export function isLegacySupportedSelector(selector) {
  let supported = true;
  scanTopLevel(selector, (char, index, depth) => {
    if (depth !== 0) return undefined;
    if (char === "&") { supported = false; return false; }
    if (char !== ":" || selector[index - 1] === ":") return undefined;
    const match = /^(::?)([-\w]+)(\()?/.exec(selector.slice(index));
    if (!match) { supported = false; return false; }
    const [, colons, rawName, paren] = match;
    const name = rawName.toLowerCase();
    if (colons === "::") {
      if (!SUPPORTED_PSEUDO_ELEMENTS.has(name) && !name.startsWith("-webkit-")) supported = false;
    } else if (LEGACY_PSEUDO_ELEMENTS.has(name)) {
      // :before / :after con un solo ':' (sintaxis CSS2) -> válido.
    } else if (!SUPPORTED_PSEUDO_CLASSES.has(name)) {
      supported = false;
    } else if (paren) {
      const open = index + match[0].length - 1;
      const close = findMatchingParen(selector, open);
      const args = close < 0 ? "" : selector.slice(open + 1, close);
      if (close < 0) supported = false;
      else if (name === "not" && !isSimpleSelector(args)) supported = false;
      else if ((name === "nth-child" || name === "nth-last-child") && /\bof\b/i.test(args)) supported = false;
      else if (name === "-webkit-any" && splitTopLevel(args, ",").some((part) => hasTopLevelCombinator(part))) supported = false;
    }
    return supported ? undefined : false;
  });
  return supported;
}

// true si fuera de :where() el selector no aporta especificidad (patrón de
// Tailwind para space-*/divide-*: `:where(.space-y-2>:not(:last-child))`
// vale 0,0,0 y pierde contra cualquier utilidad). Al expandir :where() esa
// especificidad aparece, así que estas reglas van un subnivel más abajo.
export function hasZeroSpecificityOutsideWhere(selector) {
  let rest = selector;
  for (let found = findFunctionalPseudo(rest, ["where"]); found; found = findFunctionalPseudo(rest, ["where"])) {
    rest = rest.slice(0, found.start) + rest.slice(found.close + 1);
  }
  return rest !== selector && !/[.#[:a-zA-Z]/.test(rest.replace(/\\./g, "x").replace(/\*/g, ""));
}

// Especificidad agregada según capa: 2 escalones por capa (subnivel :where
// cero y subnivel normal). Con !important el orden de capas se invierte pero
// el subnivel no.
function layerBoost(rank, zeroWhere, important) {
  return 2 * (important ? UNLAYERED_RANK - rank : rank) + (zeroWhere ? 0 : 1);
}

// Agrega `count` veces :not(#\#) al sujeto, antes de su pseudo-elemento.
export function boostSelector(selector, count) {
  if (count <= 0) return selector;
  const start = lastCompoundStart(selector);
  const compound = selector.slice(start);
  let insertAt = compound.length;
  scanTopLevel(compound, (char, index, depth) => {
    if (depth !== 0 || char !== ":") return undefined;
    if (compound[index + 1] === ":") { insertAt = index; return false; }
    const name = /^:([-\w]+)/.exec(compound.slice(index));
    if (name && compound[index - 1] !== ":" && LEGACY_PSEUDO_ELEMENTS.has(name[1].toLowerCase())) { insertAt = index; return false; }
    return undefined;
  });
  return selector.slice(0, start) + compound.slice(0, insertAt) + BOOST.repeat(count) + compound.slice(insertAt);
}

// ---------------------------------------------------------------------------
// Declaraciones.

function parseDeclarations(body) {
  return splitTopLevel(body, ";").map((raw) => {
    const colon = raw.indexOf(":");
    if (colon < 0) return null;
    const prop = raw.slice(0, colon).trim();
    let value = raw.slice(colon + 1).trim();
    if (!prop || (!value && !prop.startsWith("--"))) return null;
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, "").trim();
    return { prop: prop.startsWith("--") ? prop : prop.toLowerCase(), value, important };
  }).filter(Boolean);
}

const TRANSFORM_PARTS = Object.freeze({
  translate: "--pf-legacy-translate",
  rotate: "--pf-legacy-rotate",
  scale: "--pf-legacy-scale",
  transform: "--pf-legacy-transform",
});
const TRANSFORM_IDENTITY = Object.freeze({
  translate: "translate(0,0)",
  rotate: "rotate(0deg)",
  scale: "scale(1,1)",
  transform: "translate(0,0)",
});
const COMPOSED_TRANSFORM = "var(--pf-legacy-translate,translate(0,0)) var(--pf-legacy-rotate,rotate(0deg)) var(--pf-legacy-scale,scale(1,1)) var(--pf-legacy-transform,translate(0,0))";

// Las propiedades de transformación individuales se componen en el orden de
// la especificación (translate, rotate, scale, transform). Cada parte vive en
// su propia variable, reseteada en todos los elementos para no heredarse.
export const LEGACY_TRANSFORM_RESET = `*,:before,:after{${Object.keys(TRANSFORM_PARTS).map((key) => `${TRANSFORM_PARTS[key]}:${TRANSFORM_IDENTITY[key]}`).join(";")}}`;

function transformFunction(kind, value) {
  if (/^none$/i.test(value)) return TRANSFORM_IDENTITY[kind];
  if (kind === "transform") return value;
  const parts = splitWhitespace(value).map((part) => (kind === "scale" && /^-?[\d.]+%$/.test(part) ? String(Number.parseFloat(part) / 100) : part));
  if (kind === "rotate") return parts.length === 1 ? `rotate(${parts[0]})` : null;
  if (parts.length === 1) return `${kind}(${parts[0]})`;
  if (parts.length === 2) return `${kind}(${parts[0]},${parts[1]})`;
  if (parts.length === 3) return `${kind}3d(${parts.join(",")})`;
  return null;
}

function sides(value, count) {
  const parts = splitWhitespace(value);
  if (!parts.length || parts.length > count) return null;
  if (count === 2) return [parts[0], parts[1] ?? parts[0]];
  const [top, right = top, bottom = top, left = right] = parts;
  return [top, right, bottom, left];
}

const LOGICAL_PAIRS = Object.freeze({
  "padding-inline": ["padding-left", "padding-right"],
  "padding-block": ["padding-top", "padding-bottom"],
  "margin-inline": ["margin-left", "margin-right"],
  "margin-block": ["margin-top", "margin-bottom"],
  "inset-inline": ["left", "right"],
  "inset-block": ["top", "bottom"],
});
const LOGICAL_SINGLE = Object.freeze({
  "inset-inline-start": "left",
  "inset-inline-end": "right",
  "inset-block-start": "top",
  "inset-block-end": "bottom",
});
const VIEWPORT_UNIT_FALLBACK = /(\d|\.)(?:d|s|l)v(h|w|min|max)\b/g;

function legacyDeclarations(declaration, state) {
  const { prop, value, important } = declaration;
  const make = (nextProp, nextValue) => ({ prop: nextProp, value: nextValue, important });
  if (LOGICAL_PAIRS[prop]) {
    const values = sides(value, 2);
    return values ? LOGICAL_PAIRS[prop].map((physical, index) => make(physical, values[index])) : [];
  }
  if (LOGICAL_SINGLE[prop]) return [make(LOGICAL_SINGLE[prop], value)];
  if (prop === "inset") {
    const values = sides(value, 4);
    return values ? ["top", "right", "bottom", "left"].map((physical, index) => make(physical, values[index])) : [];
  }
  if (TRANSFORM_PARTS[prop]) {
    const fn = transformFunction(prop, value);
    if (!fn) return [];
    state.usedTransform = true;
    return [make(TRANSFORM_PARTS[prop], fn), make("transform", COMPOSED_TRANSFORM)];
  }
  // Tailwind v4 escala con porcentajes (--tw-scale-x:95%); scale() de Chrome
  // 83 solo acepta números.
  if (/^--tw-scale-[xyz]$/.test(prop) && /^-?[\d.]+%$/.test(value)) {
    return [make(prop, String(Number.parseFloat(value) / 100))];
  }
  if (prop === "appearance") return [make("-webkit-appearance", value), declaration];
  if (!prop.startsWith("--") && VIEWPORT_UNIT_FALLBACK.test(value)) {
    VIEWPORT_UNIT_FALLBACK.lastIndex = 0;
    return [make(prop, value.replace(VIEWPORT_UNIT_FALLBACK, "$1v$2")), declaration];
  }
  VIEWPORT_UNIT_FALLBACK.lastIndex = 0;
  return [declaration];
}

function dedupeComposedTransform(declarations) {
  const lastComposed = declarations.map((d) => d.prop === "transform" && d.value === COMPOSED_TRANSFORM).lastIndexOf(true);
  return declarations.filter((d, index) => !(d.prop === "transform" && d.value === COMPOSED_TRANSFORM) || index === lastComposed);
}

function serializeRule(selectors, declarations) {
  const body = declarations.map((d) => `${d.prop}:${d.value}${d.important ? "!important" : ""}`).join(";");
  return `${selectors.join(",")}{${body}}`;
}

// Chrome 83 soporta gap en grid, pero NO en flex (84+). Fallback con márgenes
// entre hijos para contenedores .flex/.inline-flex (fila) y .flex-col.
function flexGapRules(selectors, declarations) {
  const rules = [];
  for (const declaration of declarations) {
    if (declaration.important || !["gap", "column-gap", "row-gap"].includes(declaration.prop)) continue;
    const parts = splitWhitespace(declaration.value);
    const rowGap = declaration.prop === "column-gap" ? null : parts[0];
    const columnGap = declaration.prop === "row-gap" ? null : (parts[1] ?? parts[0]);
    const simple = selectors.filter((selector) => !hasTopLevelCombinator(selector) && !selector.replace(/\\./g, "").includes(":"));
    if (!simple.length) continue;
    if (columnGap && columnGap !== "normal") {
      const row = ":not(.flex-col):not(.flex-col-reverse)>";
      rules.push([simple.flatMap((s) => [`.flex${s}${row}*+*`, `.inline-flex${s}${row}*+*`]), [{ prop: "margin-left", value: columnGap, important: false }]]);
      // `<Icon /> Texto`: el texto es un nodo suelto que *+* no alcanza; el
      // espacio va a la derecha del ícono cuando es el único elemento.
      rules.push([simple.flatMap((s) => [`.flex${s}${row}svg:only-child`, `.inline-flex${s}${row}svg:only-child`]), [{ prop: "margin-right", value: columnGap, important: false }]]);
    }
    if (rowGap && rowGap !== "normal") {
      rules.push([simple.map((s) => `.flex-col${s}>*+*`), [{ prop: "margin-top", value: rowGap, important: false }]]);
    }
  }
  return rules;
}

// ---------------------------------------------------------------------------
// Transformación.

function emitRule(node, rank, state, out) {
  const seen = new Set();
  const entries = [];
  for (const original of splitTopLevel(node.selector, ",").map((selector) => selector.trim()).filter(Boolean)) {
    const zeroWhere = hasZeroSpecificityOutsideWhere(original);
    for (const expanded of expandIsWhere(original)) {
      const selector = expanded.trim();
      if (!selector || seen.has(selector) || !isLegacySupportedSelector(selector)) continue;
      seen.add(selector);
      entries.push({ selector, zeroWhere });
    }
  }
  if (!entries.length) return;
  const boosted = (important) => entries.map(({ selector, zeroWhere }) => boostSelector(selector, layerBoost(rank, zeroWhere, important)));
  const declarations = dedupeComposedTransform(parseDeclarations(node.body).flatMap((d) => legacyDeclarations(d, state)));
  const normal = declarations.filter((d) => !d.important);
  const important = declarations.filter((d) => d.important);
  if (normal.length) out.push(serializeRule(boosted(false), normal));
  if (important.length) out.push(serializeRule(boosted(true), important));
  if (state.flexGapFallback) {
    const plain = entries.filter((entry) => !entry.zeroWhere).map((entry) => entry.selector);
    for (const [gapSelectors, gapDeclarations] of flexGapRules(plain, normal)) {
      out.push(serializeRule(gapSelectors.map((s) => boostSelector(s, layerBoost(rank, false, false))), gapDeclarations));
    }
  }
}

function emitNodes(nodes, rank, state, out) {
  for (const node of nodes) {
    if (node.kind === "rule") { emitRule(node, rank, state, out); continue; }
    const { name, prelude, body } = node;
    if (name === "property") continue; // Chrome 85+; su fallback es la capa `properties`.
    if (name === "layer") {
      if (body === null) continue; // `@layer a, b;` solo declara orden.
      const layerRank = LAYER_RANK[prelude.split(/[\s.]/)[0]] ?? UNKNOWN_LAYER_RANK;
      emitNodes(parseStylesheet(body), prelude ? layerRank : UNKNOWN_LAYER_RANK, state, out);
      continue;
    }
    if (body === null) { out.push(`@${name} ${prelude};`); continue; }
    if (name === "supports" && /margin-trim|-moz-orient/.test(prelude)) {
      // Detección de Tailwind "navegador sin @property": en el camino legacy
      // siempre es cierta, así que los valores iniciales --tw-* se aplican sin
      // depender de cómo Chrome 83 evalúe esa condición.
      emitNodes(parseStylesheet(body), rank, state, out);
      continue;
    }
    if (NESTED_RULE_AT_RULES.has(name)) {
      const inner = [];
      emitNodes(parseStylesheet(body), rank, state, inner);
      if (inner.length) out.push(`@${name} ${prelude}{${inner.join("")}}`);
      continue;
    }
    // @keyframes, @font-face, etc.: se conservan tal cual.
    out.push(`@${name}${prelude ? ` ${prelude}` : ""}{${body}}`);
  }
}

// La hoja legacy se inyecta como <style> en el documento: las url() relativas
// (fuentes ../media/*.woff2) deben resolverse contra la URL de la hoja
// original, no contra la del documento.
export function rebaseCssUrls(css, baseUrl) {
  if (!baseUrl) return css;
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (match, quote, url) => {
    const trimmed = url.trim();
    if (/^(data:|[a-z][a-z0-9+.-]*:|\/|#)/i.test(trimmed)) return match;
    try {
      return `url(${quote}${new URL(trimmed, baseUrl).href}${quote})`;
    } catch {
      return match;
    }
  });
}

export function transformCssForLegacyWebView(css, { flexGapFallback = true, baseUrl = null } = {}) {
  const state = { flexGapFallback, usedTransform: false };
  const out = [];
  emitNodes(parseStylesheet(rebaseCssUrls(String(css ?? ""), baseUrl)), UNLAYERED_RANK, state, out);
  return (state.usedTransform ? LEGACY_TRANSFORM_RESET : "") + out.join("");
}

// true si el navegador necesita la hoja legacy (no soporta cascade layers).
export function needsLegacyCss(globalObject) {
  return Boolean(globalObject) && typeof globalObject.CSSLayerBlockRule === "undefined";
}
