"use client";

import { parseOcrPlateText } from "./entryPlateCore.mjs";

// POS Entry/Exit — Fase 2: OCR/ANPR LOCAL para PROPONER la patente.
//
// Motor: tesseract.js 7 (Apache-2.0), WebAssembly en el propio navegador /
// WebView. La imagen NUNCA sale del dispositivo: no hay servicio externo,
// API key ni SaaS. Para no depender de un CDN en tiempo de ejecución, la
// librería, el worker, el core WASM (variantes LSTM con y sin SIMD) y el
// modelo "eng" (4.0.0_best_int) se sirven desde este mismo sitio
// (public/vendor/tesseract/7.0.0, generado por scripts/vendor-tesseract.mjs).
// Se cargan recién la primera vez que el operador usa "LEER CON CÁMARA"
// (import dinámico), nunca en la carga normal del POS.
//
// El resultado es SOLO una propuesta: el llamador (PosTerminal) siempre
// pasa por la confirmación explícita del operador antes de registrar.

export const OCR_ASSET_BASE = "/vendor/tesseract/7.0.0";
const OCR_TIMEOUT_MS = 45000;
// Primera carga (descarga ~6 MB + compilación WASM): en la TUU PRO2 (WebView
// 83, CPU modesta) tarda bastante más que una lectura.
const OCR_LOAD_TIMEOUT_MS = 120000;
// PSM 7 = "una sola línea de texto" (el recorte ya es solo la patente).
const PSM_SINGLE_LINE = "7";
const PLATE_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

let workerPromise = null;
// Diagnóstico de carga (QA PRO2): última etapa informada por tesseract y
// último error del worker, para mostrar un detalle técnico si la carga falla.
let lastLoadStatus = "";
let lastWorkerError = "";

// Módulo WASM mínimo con una instrucción SIMD (misma técnica que
// wasm-feature-detect): si el motor lo valida, se usa el core con SIMD
// (más rápido); si no (p. ej. WebView antiguo), el core LSTM sin SIMD.
const WASM_SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

function supportsWasmSimd() {
  try {
    return typeof WebAssembly === "object" && WebAssembly.validate(WASM_SIMD_PROBE);
  } catch {
    return false;
  }
}

async function createPlateWorker() {
  const origin = window.location.origin;
  const base = `${origin}${OCR_ASSET_BASE}`;
  const corePath = supportsWasmSimd()
    ? `${base}/tesseract-core-simd-lstm.js`
    : `${base}/tesseract-core-lstm.js`;
  // La librería también se sirve desde /vendor (no se empaqueta con el
  // bundle del POS): el import dinámico queda fuera del bundler a propósito.
  const tesseractModule = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${base}/tesseract.esm.min.js`);
  const Tesseract = tesseractModule.default || tesseractModule;
  // workerBlobURL=false: el worker se carga desde su URL real en /vendor,
  // así el core (.js) encuentra su .wasm en el mismo directorio (con un
  // worker "blob:" la ruta relativa del .wasm no se puede resolver).
  const worker = await Tesseract.createWorker("eng", Tesseract.OEM?.LSTM_ONLY ?? 1, {
    workerPath: `${base}/worker.min.js`,
    corePath,
    langPath: base,
    gzip: true,
    workerBlobURL: false,
    logger: (message) => {
      if (!message || !message.status) return;
      const progress = typeof message.progress === "number" ? ` ${Math.round(message.progress * 100)}%` : "";
      lastLoadStatus = `${message.status}${progress}`;
    },
    errorHandler: (error) => {
      lastWorkerError = String((error && error.message) || error || "");
    },
  });
  await worker.setParameters({
    tessedit_char_whitelist: PLATE_WHITELIST,
    tessedit_pageseg_mode: PSM_SINGLE_LINE,
  });
  return worker;
}

// Arranca la carga del lector en segundo plano (p. ej. al abrir la cámara
// OCR) para que esté listo cuando el operador capture. Idempotente.
export function preloadPlateOcr() {
  getWorker().catch(() => {});
}

function describeLoadFailure(error) {
  const reason = error && error.message === "OCR_TIMEOUT" ? "tiempo agotado" : String((error && error.message) || error || "error desconocido");
  const parts = [reason, `etapa: ${lastLoadStatus || "inicio"}`];
  if (lastWorkerError && lastWorkerError !== reason) parts.push(lastWorkerError);
  return parts.join(" · ").slice(0, 300);
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = createPlateWorker().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("OCR_TIMEOUT")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// imageSource: data URL / Blob / canvas del recorte de patente ya tomado
// por PlatePhotoCapture. Devuelve { ok, code, proposal }:
// - ok=true  -> proposal = { plate, lowConfidence, confidence, ... }
// - ok=false -> code = OCR_LOAD_FAILED | OCR_FAILED | OCR_NO_RESULT
export async function recognizePlate(imageSource) {
  let worker;
  try {
    worker = await withTimeout(getWorker(), OCR_LOAD_TIMEOUT_MS);
  } catch (error) {
    return { ok: false, code: "OCR_LOAD_FAILED", proposal: null, detail: describeLoadFailure(error) };
  }
  return recognizePlateWithWorker(worker, imageSource);
}

// Separado de la carga del worker para poder probarlo con un worker falso
// (node --test no tiene WebAssembly de tesseract ni window).
export async function recognizePlateWithWorker(worker, imageSource, timeoutMs = OCR_TIMEOUT_MS) {
  try {
    // tesseract.js >= 6 solo devuelve el texto por defecto: sin "blocks"
    // la confianza llega en 0 (validado en navegador) y toda lectura se
    // marcaría como dudosa.
    const result = await withTimeout(worker.recognize(imageSource, {}, { text: true, blocks: true }), timeoutMs);
    const proposal = parseOcrPlateText(result?.data?.text, result?.data?.confidence);
    if (!proposal.plate) return { ok: false, code: "OCR_NO_RESULT", proposal };
    return { ok: true, code: proposal.lowConfidence ? "OCR_LOW_CONFIDENCE" : "", proposal };
  } catch {
    return { ok: false, code: "OCR_FAILED", proposal: null };
  }
}

// Libera el worker (memoria WASM) al salir del POS; se vuelve a crear bajo
// demanda la próxima vez.
export async function releasePlateOcr() {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // Nada que liberar.
  }
}
