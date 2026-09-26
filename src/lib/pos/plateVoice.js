"use client";

import { parseSpokenPlate } from "./entryPlateCore.mjs";

// POS Entry/Exit — Fase 2: dictado de patente por voz, SOLO con
// reconocimiento EN EL DISPOSITIVO.
//
// La Web Speech API "clásica" de Chrome envía el audio a servidores de
// Google (servicio de voz en la nube): NO está autorizado para el POS. Por
// eso solo se usa la variante local (SpeechRecognition.available/install +
// recognition.processLocally = true, Chromium >= 139). Si el dispositivo no
// la ofrece, el dictado queda deshabilitado con un mensaje claro y el
// operador sigue con el ingreso manual.
//
// Limitaciones conocidas (ver informe de Fase 2):
// - El WebView de Android de la app POS nativa NO implementa
//   SpeechRecognition: allí el dictado queda "no disponible". Habilitarlo
//   requeriría un bridge nativo (Android SpeechRecognizer) en
//   parkfacil-pos-android.
// - El resultado es SOLO una propuesta: siempre pasa por la confirmación
//   explícita del operador. Nunca registra un ingreso.

export const VOICE_LANGS = Object.freeze(["es-CL", "es-419", "es-ES"]);
export const VOICE_LISTEN_TIMEOUT_MS = 10000;

export function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// Devuelve { status, lang }:
// - AVAILABLE      -> se puede dictar ya (modelo local instalado)
// - DOWNLOADABLE   -> el modelo local se puede instalar (acción del operador)
// - UNSUPPORTED    -> el navegador/WebView no tiene SpeechRecognition
// - LOCAL_UNAVAILABLE -> hay SpeechRecognition pero sin reconocimiento local
export async function detectLocalVoiceSupport(Ctor = getSpeechRecognitionCtor()) {
  if (!Ctor) return { status: "UNSUPPORTED", lang: null };
  if (typeof Ctor.available !== "function" || !("processLocally" in (Ctor.prototype || {}))) {
    return { status: "LOCAL_UNAVAILABLE", lang: null };
  }
  let downloadable = null;
  for (const lang of VOICE_LANGS) {
    try {
      const availability = await Ctor.available({ langs: [lang], processLocally: true });
      if (availability === "available") return { status: "AVAILABLE", lang };
      if ((availability === "downloadable" || availability === "downloading") && !downloadable) downloadable = lang;
    } catch {
      // Se prueba el siguiente idioma.
    }
  }
  if (downloadable) return { status: "DOWNLOADABLE", lang: downloadable };
  return { status: "LOCAL_UNAVAILABLE", lang: null };
}

// Descarga el paquete de reconocimiento local (lo pide el operador con un
// botón; el audio nunca sale del dispositivo, solo se descarga el modelo).
export async function installLocalVoice(lang, Ctor = getSpeechRecognitionCtor()) {
  if (!Ctor || typeof Ctor.install !== "function") return false;
  try {
    return Boolean(await Ctor.install({ langs: [lang], processLocally: true }));
  } catch {
    return false;
  }
}

function errorCodeFor(event) {
  const kind = event?.error || "";
  if (kind === "not-allowed" || kind === "service-not-allowed") return "MIC_PERMISSION_DENIED";
  if (kind === "audio-capture") return "MIC_UNAVAILABLE";
  if (kind === "language-not-supported") return "VOICE_LOCAL_UNAVAILABLE";
  if (kind === "no-speech" || kind === "aborted") return "VOICE_NOT_UNDERSTOOD";
  return "VOICE_NOT_UNDERSTOOD";
}

// Escucha UNA frase (nunca escucha permanente: continuous=false + tope de
// VOICE_LISTEN_TIMEOUT_MS). Devuelve un controlador con cancel().
// onDone recibe { ok, code, plate, transcript }.
export function listenForPlate({ lang, onDone, Ctor = getSpeechRecognitionCtor() }) {
  if (!Ctor) {
    onDone({ ok: false, code: "VOICE_UNSUPPORTED", plate: null, transcript: "" });
    return { cancel() {} };
  }
  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.processLocally = true;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 5;

  let finished = false;
  const finish = (outcome) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    onDone(outcome);
  };
  const timer = setTimeout(() => {
    try { recognition.abort(); } catch { /* ya detenido */ }
    finish({ ok: false, code: "VOICE_NOT_UNDERSTOOD", plate: null, transcript: "" });
  }, VOICE_LISTEN_TIMEOUT_MS);

  recognition.onresult = (event) => {
    const alternatives = [];
    const result = event?.results?.[0];
    for (let index = 0; result && index < result.length; index += 1) {
      if (result[index]?.transcript) alternatives.push(result[index].transcript);
    }
    const parsed = parseSpokenPlate(alternatives);
    finish(parsed.plate
      ? { ok: true, code: "", plate: parsed.plate, transcript: parsed.transcript }
      : { ok: false, code: "VOICE_NOT_UNDERSTOOD", plate: null, transcript: parsed.transcript });
  };
  recognition.onerror = (event) => finish({ ok: false, code: errorCodeFor(event), plate: null, transcript: "" });
  recognition.onend = () => finish({ ok: false, code: "VOICE_NOT_UNDERSTOOD", plate: null, transcript: "" });

  try {
    recognition.start();
  } catch {
    finish({ ok: false, code: "MIC_UNAVAILABLE", plate: null, transcript: "" });
  }

  return {
    cancel() {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { recognition.abort(); } catch { /* ya detenido */ }
    },
  };
}
