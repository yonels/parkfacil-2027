import test from "node:test";
import assert from "node:assert/strict";

// Sin DOM real (node --test, sin jsdom -- mismo criterio que el resto del
// proyecto): se simula `window`/`localStorage` a mano antes de cada test
// y se limpia después, para probar detectPlatform()/isPrintingAvailable()
// en los 3 entornos reales (navegador plano, Android Capacitor, iOS
// Capacitor) sin un navegador de verdad.
// "fn" puede ser async -- se espera su resultado ANTES de restaurar
// window (si no, un test con withWindow(..., async () => {...}) sin
// await en el llamador dejaría window ya restaurado mientras el cuerpo
// async todavía sigue ejecutando sus propios await).
async function withWindow(win, fn) {
  const previous = globalThis.window;
  globalThis.window = win;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

// Simula navigator.userAgent -- corrección 2026-08-31: isPrintingAvailable()
// para PC ya no usa matchMedia("(pointer: coarse)") (daba falso negativo en
// un PC real con pantalla táctil), ahora distingue por sistema operativo
// vía user-agent (ver isLikelyMobileOS en printerAdapter.js). Igual que
// withWindow, restaura el navigator real después -- Node expone su propio
// navigator.userAgent global ("Node.js/x"), así que sin este helper los
// tests leerían ESE valor en vez de uno simulado.
const REAL_DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const REAL_ANDROID_UA = "Mozilla/5.0 (Linux; Android 13; SM-A125M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
// globalThis.navigator es un getter de solo lectura en Node (no un valor
// simple como window) -- una asignación directa lanza "Cannot set property
// navigator ... which has only a getter", así que hay que redefinir la
// propiedad explícitamente para poder simularla y restaurarla después.
async function withNavigator(userAgent, fn) {
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { userAgent }, configurable: true, writable: true });
  try {
    return await fn();
  } finally {
    if (previousDescriptor) Object.defineProperty(globalThis, "navigator", previousDescriptor);
    else delete globalThis.navigator;
  }
}

const {
  PLATFORM, UNAVAILABLE_REASON, UNAVAILABLE_MESSAGE,
  detectPlatform, isPrintingAvailable, unavailableReason,
  listPairedPrinters, connectPrinter, disconnectPrinter, getPrinterStatus, printBytes,
  printCourtesyFineViaPcAgent,
  getSavedPrinter, saveSelectedPrinter, clearSavedPrinter,
} = await import("./printerAdapter.js");

test("detectPlatform(): sin window (SSR) -> WEB", () => {
  assert.equal(detectPlatform(), PLATFORM.WEB);
});

test("detectPlatform(): navegador/PWA plano (sin window.Capacitor) -> WEB", () => {
  withWindow({}, () => assert.equal(detectPlatform(), PLATFORM.WEB));
});

test("detectPlatform(): Capacitor Android -> ANDROID", () => {
  withWindow({ Capacitor: { getPlatform: () => "android" } }, () => assert.equal(detectPlatform(), PLATFORM.ANDROID));
});

test("detectPlatform(): Capacitor iOS -> IOS", () => {
  withWindow({ Capacitor: { getPlatform: () => "ios" } }, () => assert.equal(detectPlatform(), PLATFORM.IOS));
});

test("isPrintingAvailable(): true en Android con el plugin nativo ParkFacilPrinter registrado, o en navegador de escritorio (PC, vía el agente local) -- nunca en iOS, nunca en Android sin el plugin, nunca en navegador/PWA móvil", async () => {
  await withWindow({}, () => assert.equal(isPrintingAvailable(), true, "web sin navigator simulado (Node expone su propio navigator, que no parece móvil) -- ver detalle de este caso en el siguiente test"));
  withWindow({ Capacitor: { getPlatform: () => "ios" } }, () => assert.equal(isPrintingAvailable(), false, "iOS"));
  withWindow({ Capacitor: { getPlatform: () => "android" } }, () => assert.equal(isPrintingAvailable(), false, "Android sin el plugin registrado"));
  withWindow({ Capacitor: { getPlatform: () => "android", Plugins: { ParkFacilPrinter: {} } } }, () => assert.equal(isPrintingAvailable(), true, "Android con el plugin"));
  await withWindow({}, () => withNavigator(REAL_ANDROID_UA, () => assert.equal(isPrintingAvailable(), false, "navegador/PWA móvil real (Android Chrome, sin Capacitor) -- sin plugin Android ni agente de PC real")));
  await withWindow({}, () => withNavigator(REAL_DESKTOP_UA, () => assert.equal(isPrintingAvailable(), true, "navegador de escritorio real (Windows Chrome) -- PC, vía el agente local ya existente")));
});

test("corrección 2026-08-31: un PC con pantalla táctil YA NO da falso negativo -- el user-agent (sistema operativo), no el tipo de puntero, decide si es PC", async () => {
  // Antes de esta corrección, matchMedia("(pointer: coarse)") podía evaluar
  // "coarse" en un PC real con pantalla táctil (portátiles 2-en-1,
  // monitores táctiles) y mostrar por error "requiere la app Android" en
  // pleno navegador de escritorio -- reportado en un PC real. El user-agent
  // de un PC sigue siendo de escritorio sin importar si tiene pantalla
  // táctil, así que ya no hereda ese problema.
  await withWindow({ matchMedia: () => ({ matches: true }) }, () => withNavigator(REAL_DESKTOP_UA, () => {
    assert.equal(isPrintingAvailable(), true, "PC con pantalla táctil (pointer:coarse=true) sigue detectándose como PC");
  }));
});

test("un navegador de escritorio (PC) YA NO recibe el motivo REQUIRES_ANDROID_APP -- isPrintingAvailable() es true, así que unavailableReason() ni se consulta en la UI", async () => {
  await withWindow({}, () => withNavigator(REAL_DESKTOP_UA, () => assert.equal(isPrintingAvailable(), true)));
});

test("unavailableReason(): distingue las 3 causas reales -- iOS no soportado (impresora/transporte), falta la app Android, o Android sin el plugin", () => {
  withWindow({ Capacitor: { getPlatform: () => "ios" } }, () => assert.equal(unavailableReason(), UNAVAILABLE_REASON.IOS_NOT_SUPPORTED));
  withWindow({}, () => assert.equal(unavailableReason(), UNAVAILABLE_REASON.REQUIRES_ANDROID_APP));
  withWindow({ Capacitor: { getPlatform: () => "android" } }, () => assert.equal(unavailableReason(), UNAVAILABLE_REASON.PRINTER_PLUGIN_MISSING));
});

test("UNAVAILABLE_MESSAGE: existe un mensaje real (no vacío) para cada motivo -- nunca se muestra un código crudo al inspector", () => {
  for (const reason of Object.values(UNAVAILABLE_REASON)) {
    assert.ok(UNAVAILABLE_MESSAGE[reason] && UNAVAILABLE_MESSAGE[reason].length > 10, reason);
  }
  assert.match(UNAVAILABLE_MESSAGE.IOS_NOT_SUPPORTED, /MFi/, "el mensaje de iOS debe explicar la causa real (MFi), no una excusa genérica");
});

test("listPairedPrinters()/connectPrinter()/disconnectPrinter()/getPrinterStatus()/printBytes(): delegan tal cual al plugin nativo Capacitor 'ParkFacilPrinter'", async () => {
  const calls = [];
  const plugin = {
    listPairedDevices: async () => { calls.push("list"); return { devices: [{ deviceId: "AA:BB", name: "MTP-II" }] }; },
    connect: async (args) => { calls.push(["connect", args]); return { ok: true, code: "CONNECTED", message: "" }; },
    disconnect: async () => { calls.push("disconnect"); },
    getStatus: async () => { calls.push("status"); return { connected: true, deviceId: "AA:BB", deviceName: "MTP-II" }; },
    printBytes: async (args) => { calls.push(["print", args]); return { ok: true, code: "PRINT_OK", message: "" }; },
  };
  await withWindow({ Capacitor: { getPlatform: () => "android", Plugins: { ParkFacilPrinter: plugin } } }, async () => {
    assert.deepEqual(await listPairedPrinters(), [{ deviceId: "AA:BB", name: "MTP-II" }]);
    assert.deepEqual(await connectPrinter("AA:BB"), { ok: true, code: "CONNECTED", message: "" });
    assert.deepEqual(await getPrinterStatus(), { connected: true, deviceId: "AA:BB", deviceName: "MTP-II" });
    const printResult = await printBytes(new Uint8Array([0x1b, 0x40]));
    assert.deepEqual(printResult, { ok: true, code: "PRINT_OK", message: "" });
    await disconnectPrinter();
    assert.deepEqual(calls[1], ["connect", { deviceId: "AA:BB" }]);
    assert.deepEqual(calls[3][1], { dataBase64: "G0A=" }, "0x1b 0x40 en base64 es 'G0A='");
    assert.ok(calls.includes("disconnect"));
  });
});

test("listPairedPrinters()/connectPrinter()/printBytes(): lanzan PRINTER_PLUGIN_MISSING si no hay plugin -- nunca fingen éxito", async () => {
  await withWindow({}, async () => {
    await assert.rejects(() => listPairedPrinters(), /PRINTER_PLUGIN_MISSING/);
    await assert.rejects(() => connectPrinter("AA:BB"), /PRINTER_PLUGIN_MISSING/);
    await assert.rejects(() => printBytes(new Uint8Array([1])), /PRINTER_PLUGIN_MISSING/);
  });
});

test("getPrinterStatus()/disconnectPrinter(): sin plugin, responden 'desconectado' en vez de lanzar (no bloquean el trabajo del inspector)", async () => {
  await withWindow({}, async () => {
    assert.deepEqual(await getPrinterStatus(), { connected: false, deviceId: null, deviceName: null });
    await assert.doesNotReject(() => disconnectPrinter());
  });
});

// --- printCourtesyFineViaPcAgent (corrección 2026-08-31): mismo agente
// HTTP local que ya usa POS (mismo host/puerto/token, ver
// PosTerminal.js/PRINT_AGENT_URL) -- se mockea fetch en vez del plugin
// Capacitor, ya que este transporte no depende de window.Capacitor.

async function withFetch(impl, fn) {
  const previous = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete globalThis.fetch; else globalThis.fetch = previous;
  }
}

test("printCourtesyFineViaPcAgent(): llama a POST http://127.0.0.1:19100/print con el token del agente y el payload COURTESY_FINE tal cual", async () => {
  const calls = [];
  await withFetch(async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ ok: true, code: "PRINT_OK", message: "" }) };
  }, async () => {
    const payload = { type: "COURTESY_FINE", patente: "ABCD12", fechaHora: "30/08/2026  18:25", folio: "1A2B3C4D" };
    const result = await printCourtesyFineViaPcAgent(payload);
    assert.deepEqual(result, { attempted: true, ok: true, code: "PRINT_OK", message: "" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:19100/print");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers["x-parkfacil-agent-token"], "p9tMJvWWvuN70lKB4JLiGK98wS9o-buE", "mismo token que ya usa POS con este agente");
    assert.deepEqual(JSON.parse(calls[0].init.body), payload);
  });
});

test("printCourtesyFineViaPcAgent(): el agente responde ok:false (p.ej. ticket inválido) -- se reporta tal cual, nunca se lanza", async () => {
  await withFetch(async () => ({ ok: true, json: async () => ({ ok: false, code: "PRINT_ERROR", message: "Falta el campo requerido: folio" }) }), async () => {
    const result = await printCourtesyFineViaPcAgent({ type: "COURTESY_FINE", patente: "X" });
    assert.deepEqual(result, { attempted: true, ok: false, code: "PRINT_ERROR", message: "Falta el campo requerido: folio" });
  });
});

test("printCourtesyFineViaPcAgent(): agente no disponible en este equipo (fetch falla) -> AGENT_UNREACHABLE, nunca una excepción sin manejar", async () => {
  await withFetch(async () => { throw new Error("fetch failed"); }, async () => {
    const result = await printCourtesyFineViaPcAgent({ type: "COURTESY_FINE", patente: "X" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "AGENT_UNREACHABLE");
    assert.match(result.message, /ParkFacil Print Agent/);
  });
});

test("Persistencia de impresora (§8): guarda/lee/limpia SOLO deviceId + deviceName -- nunca un secreto/token", () => {
  withWindow({ localStorage: fakeLocalStorage() }, () => {
    assert.equal(getSavedPrinter(), null, "sin nada guardado todavía");
    saveSelectedPrinter({ deviceId: "AA:BB:CC", deviceName: "MTP-II" });
    assert.deepEqual(getSavedPrinter(), { deviceId: "AA:BB:CC", deviceName: "MTP-II" });
    clearSavedPrinter();
    assert.equal(getSavedPrinter(), null);
  });
});

test("Persistencia de impresora: nunca lanza si localStorage no está disponible (modo privado/SSR) -- getSavedPrinter devuelve null, save/clear no rompen", () => {
  withWindow({}, () => {
    assert.equal(getSavedPrinter(), null);
    assert.doesNotThrow(() => saveSelectedPrinter({ deviceId: "X", deviceName: "Y" }));
    assert.doesNotThrow(() => clearSavedPrinter());
  });
});
