// Primitivos ESC/POS (Inspector, Etapa 3 final -- Capacitor/Android,
// 2026-08-31). Réplica EXACTA (mismos comandos, misma codificación, misma
// fórmula de tamaño) de escpos.js en C:\proyectos\parkfacil-print-agent
// -- el agente de impresión de PC, YA PROBADO contra la MTP-II real. No
// se puede importar ese archivo tal cual (es CommonJS de Node, de un
// repositorio completamente aparte, pensado para escribir a un puerto
// serie) -- esta es la MISMA convención reimplementada en JS de
// navegador (Uint8Array en vez de Buffer de Node), para que el ticket que
// arma Inspector sea BYTE-COMPATIBLE con el que ya funciona en PC.
//
// Codificación: latin1 directo (NO CP850 con tabla de conversión, que es
// lo que se usó por error en un intento anterior de esta misma tarea).
// El agente de PC nunca envía un comando de codepage (ESC t n) -- confía
// en el codepage de fábrica de la MTP-II, y con esa impresora real,
// codificar los acentos españoles como Latin-1 imprime correctamente (Á
// É Í Ó Ú Ñ á é í ó ú ñ caen todos en el rango Unicode U+00C0-U+00FF,
// que en Latin-1 es un mapeo 1:1 byte-a-byte, sin tabla). Replicar
// exactamente esto (no inventar un codepage nuevo) es lo que garantiza
// que el ticket de Inspector se vea igual que los tickets de PC ya
// impresos con esta misma impresora.
const ESC = 0x1b;
const GS = 0x1d;

export function init() {
  return new Uint8Array([ESC, 0x40]); // ESC @ : inicializa la impresora
}

export function align(mode) {
  // 0 = izquierda, 1 = centro, 2 = derecha
  return new Uint8Array([ESC, 0x61, mode]);
}

export function bold(on) {
  return new Uint8Array([ESC, 0x45, on ? 1 : 0]);
}

export function size(width = 1, height = 1) {
  // GS ! n : multiplicador de ancho/alto (1-8). n=0x00 es el tamaño normal.
  const n = (((width - 1) & 0x0f) << 4) | ((height - 1) & 0x0f);
  return new Uint8Array([GS, 0x21, n]);
}

function encodeLatin1(text) {
  const bytes = [];
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    bytes.push(code <= 0xff ? code : 0x3f); // "?" de respaldo -- no debería ocurrir con el texto fijo de este ticket
  }
  return bytes;
}

export function text(line = "") {
  return new Uint8Array([...encodeLatin1(line), 0x0a]);
}

export function blank(lines = 1) {
  return new Uint8Array(Array(Math.max(0, lines)).fill(0x0a));
}

export function feed(lines = 1) {
  return new Uint8Array([ESC, 0x64, Math.max(0, lines)]); // ESC d n
}

export function cut() {
  return new Uint8Array([GS, 0x56, 0x00]); // GS V 0 : corte total
}

// Concatena varios Uint8Array/arreglos de bytes en uno solo -- equivalente
// browser-safe de Buffer.concat() (usado tal cual en ticketFormatter.js
// del agente de PC).
export function concatBytes(parts) {
  const flat = parts.flatMap((p) => (p instanceof Uint8Array ? [...p] : p));
  return new Uint8Array(flat);
}
