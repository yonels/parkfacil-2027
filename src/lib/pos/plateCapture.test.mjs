import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

import { detectLocalVoiceSupport, listenForPlate, VOICE_LISTEN_TIMEOUT_MS } from "./plateVoice.js";
import { OCR_ASSET_BASE, recognizePlateWithWorker } from "./plateOcr.js";

// POS Entry/Exit — Fase 2: módulos de captura asistida (voz y OCR) con
// reconocedor/worker simulados -- node --test no tiene Web Speech ni el
// WebAssembly de tesseract.

// ---------------------------------------------------------------------
// Voz
// ---------------------------------------------------------------------

function fakeSpeechCtor({ availability = "available", scripted } = {}) {
  const instances = [];
  class FakeRecognition {
    constructor() {
      this.processLocally = false;
      this.started = false;
      this.aborted = false;
      instances.push(this);
    }
    start() {
      this.started = true;
      if (scripted) queueMicrotask(() => scripted(this));
    }
    abort() { this.aborted = true; }
  }
  FakeRecognition.prototype.processLocally = false;
  FakeRecognition.available = async () => availability;
  FakeRecognition.install = async () => true;
  return { Ctor: FakeRecognition, instances };
}

function resultEvent(...transcripts) {
  const alternatives = transcripts.map((transcript) => ({ transcript }));
  return { results: [Object.assign(alternatives, { length: alternatives.length })] };
}

test("11. voz no soportada (sin SpeechRecognition, p. ej. WebView Android) -> UNSUPPORTED", async () => {
  assert.deepEqual(await detectLocalVoiceSupport(null), { status: "UNSUPPORTED", lang: null });
});

test("voz sin reconocimiento local (solo nube) -> LOCAL_UNAVAILABLE: nunca se usa el servicio en la nube", async () => {
  class CloudOnly {}
  assert.equal((await detectLocalVoiceSupport(CloudOnly)).status, "LOCAL_UNAVAILABLE");
  const { Ctor } = fakeSpeechCtor({ availability: "unavailable" });
  assert.equal((await detectLocalVoiceSupport(Ctor)).status, "LOCAL_UNAVAILABLE");
});

test("voz local descargable -> DOWNLOADABLE (la instalación la decide el operador)", async () => {
  const { Ctor } = fakeSpeechCtor({ availability: "downloadable" });
  assert.deepEqual(await detectLocalVoiceSupport(Ctor), { status: "DOWNLOADABLE", lang: "es-CL" });
});

test("9/10. voz propone la patente y SOLO la devuelve (no registra); escucha local, una frase", async () => {
  const { Ctor, instances } = fakeSpeechCtor({ scripted: (rec) => rec.onresult(resultEvent("hola", "be be ce de doce")) });
  const outcome = await new Promise((resolve) => listenForPlate({ lang: "es-CL", Ctor, onDone: resolve }));
  assert.deepEqual(outcome, { ok: true, code: "", plate: "BBCD12", transcript: "be be ce de doce" });
  const rec = instances[0];
  assert.equal(rec.processLocally, true, "debe exigir reconocimiento en el dispositivo");
  assert.equal(rec.continuous, false, "nunca escucha permanente");
  assert.equal(rec.interimResults, false);
  assert.equal(rec.lang, "es-CL");
});

test("voz: permiso de micrófono denegado y micrófono ausente tienen códigos propios", async () => {
  for (const [error, code] of [["not-allowed", "MIC_PERMISSION_DENIED"], ["audio-capture", "MIC_UNAVAILABLE"], ["no-speech", "VOICE_NOT_UNDERSTOOD"]]) {
    const { Ctor } = fakeSpeechCtor({ scripted: (rec) => rec.onerror({ error }) });
    const outcome = await new Promise((resolve) => listenForPlate({ lang: "es-CL", Ctor, onDone: resolve }));
    assert.equal(outcome.ok, false);
    assert.equal(outcome.code, code);
  }
});

test("voz no entendida -> VOICE_NOT_UNDERSTOOD; cancelar corta la escucha sin resultado", async () => {
  const { Ctor } = fakeSpeechCtor({ scripted: (rec) => rec.onresult(resultEvent("buenas tardes")) });
  const outcome = await new Promise((resolve) => listenForPlate({ lang: "es-CL", Ctor, onDone: resolve }));
  assert.equal(outcome.code, "VOICE_NOT_UNDERSTOOD");

  const idle = fakeSpeechCtor();
  let called = false;
  const controller = listenForPlate({ lang: "es-CL", Ctor: idle.Ctor, onDone: () => { called = true; } });
  controller.cancel();
  assert.equal(idle.instances[0].aborted, true);
  idle.instances[0].onresult?.(resultEvent("be be ce de doce"));
  assert.equal(called, false, "tras cancelar no se propone nada");
  assert.ok(VOICE_LISTEN_TIMEOUT_MS <= 15000, "la escucha tiene tope de tiempo");
});

// ---------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------

function fakeWorker(result, { fail = false } = {}) {
  const calls = [];
  return {
    calls,
    async recognize(image, options, output) {
      calls.push({ image, options, output });
      if (fail) throw new Error("boom");
      return result;
    },
  };
}

test("6/7. OCR propone la patente y no registra: solo devuelve la propuesta; pide confianza real (blocks)", async () => {
  const worker = fakeWorker({ data: { text: "BBCD12\n", confidence: 89 } });
  const outcome = await recognizePlateWithWorker(worker, "data:image/jpeg;base64,AAA");
  assert.equal(outcome.ok, true);
  assert.equal(outcome.code, "");
  assert.equal(outcome.proposal.plate, "BBCD12");
  assert.deepEqual(worker.calls[0].output, { text: true, blocks: true });
});

test("OCR dudoso -> OCR_LOW_CONFIDENCE (propone, pero exige revisión)", async () => {
  const outcome = await recognizePlateWithWorker(fakeWorker({ data: { text: "8BCD1Z", confidence: 91 } }), "img");
  assert.equal(outcome.ok, true);
  assert.equal(outcome.code, "OCR_LOW_CONFIDENCE");
});

test("8. OCR fallido o sin resultado -> código claro, sin propuesta (el manual sigue disponible)", async () => {
  assert.equal((await recognizePlateWithWorker(fakeWorker({ data: { text: "EE", confidence: 15 } }), "img")).code, "OCR_NO_RESULT");
  assert.equal((await recognizePlateWithWorker(fakeWorker(null, { fail: true }), "img")).code, "OCR_FAILED");
  const slow = { recognize: () => new Promise(() => {}) };
  assert.equal((await recognizePlateWithWorker(slow, "img", 20)).code, "OCR_FAILED", "un OCR colgado nunca bloquea el POS");
});

test("OCR 100% local: sin CDN ni servicio externo; recursos servidos desde /vendor", () => {
  const source = readFileSync(new URL("./plateOcr.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /jsdelivr|unpkg|https?:\/\/(?!localhost)/i);
  assert.match(source, /workerBlobURL: false/);
  assert.equal(OCR_ASSET_BASE, "/vendor/tesseract/7.0.0");
  for (const file of ["tesseract.esm.min.js", "worker.min.js", "tesseract-core-simd-lstm.js", "tesseract-core-simd-lstm.wasm", "tesseract-core-lstm.js", "tesseract-core-lstm.wasm", "eng.traineddata.gz"]) {
    const stat = statSync(new URL(`../../../public${OCR_ASSET_BASE}/${file}`, import.meta.url));
    assert.ok(stat.size > 1000, `${file} vacío o ausente`);
  }
});
