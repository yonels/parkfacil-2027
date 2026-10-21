"use client";
// Capa ParkFacilDevice / PrinterAdapter (Inspector, Etapa 3 final --
// Capacitor/Android, 2026-08-31). Desacopla a Inspector del transporte
// real de impresión: detecta en qué entorno corre (navegador/PWA plano,
// app Android empaquetada con Capacitor, o -- a futuro -- iOS Capacitor)
// y expone una API única (connect/disconnect/status/print) que
// CourtesyTicketPrint.js consume sin saber nada del transporte.
//
// AUDITORÍA (misma tarea, ver informe completo): la MTP-II real es
// Bluetooth CLÁSICO (SPP), confirmado en el agente de impresión de PC ya
// funcionando (C:\proyectos\parkfacil-print-agent: la impresora está
// emparejada como puerto COM6 virtual de Windows). Web Bluetooth solo
// habla BLE (GATT) -- nunca puede alcanzar un dispositivo SPP clásico,
// en NINGÚN navegador ni PWA instalada, en Android ni en iOS. Por eso
// este archivo YA NO ofrece una vía Web Bluetooth para la MTP-II (el
// intento anterior de esta misma tarea, thermalPrinterBluetooth.js, se
// eliminó) -- la única vía real es un plugin NATIVO de Android
// (Bluetooth Classic SPP real, solo alcanzable fuera del sandbox del
// navegador), empaquetado vía Capacitor. iOS queda documentado como no
// soportado con esta impresora física (ver PLATFORM_UNAVAILABLE_REASON.
// IOS_NOT_SUPPORTED) -- no por falta de código aquí, sino porque iOS
// bloquea a nivel de plataforma el Bluetooth Clásico genérico para
// cualquier app de terceros (nativa o web) salvo accesorios certificados
// MFi, y GOOJPRT no tiene esa certificación.
//
// Contrato del plugin nativo esperado (Capacitor, registrado como
// "ParkFacilPrinter" -- ver capacitor-inspector-android/native/
// ParkFacilPrinterPlugin.kt para la implementación Android real):
//   listPairedDevices() -> { devices: [{ deviceId, name }] }
//   connect({ deviceId }) -> { ok, code, message }
//   disconnect() -> { ok }
//   getStatus() -> { connected, deviceId, deviceName }
//   printBytes({ dataBase64 }) -> { ok, code, message }
//
// PC / navegador de escritorio (corrección 2026-08-31): la MTP-II YA
// imprime desde PC vía ParkFacil Print Agent (mismo agente que ya usa POS
// -- ver src/components/pos/PosTerminal.js, PRINT_AGENT_URL/
// PRINT_AGENT_TOKEN/tryLocalAgentPrint, de donde se reutiliza el mismo
// contrato HTTP tal cual). El mensaje anterior ("La impresión requiere la
// app Android...") era incorrecto para PC: confundía "sin plugin nativo
// Android" con "sin ningún transporte", cuando el agente HTTP local es un
// transporte real y distinto, ya funcionando. Distinto del transporte
// Android: aquí NO hay "conectar impresora" (el agente no expone
// pairing/estado) -- cada impresión es una llamada HTTP independiente al
// agente, que falla con AGENT_UNREACHABLE si no está abierto en este
// equipo (ver printCourtesyFineViaPcAgent). "Escritorio" se distingue de
// "navegador/PWA móvil" (que debe seguir mostrando el aviso de app
// Android, sin intentar nunca un agente que no podría existir en un
// teléfono) por sistema operativo vía user-agent (ver isLikelyMobileOS
// abajo) -- corregido 2026-08-31 tras confirmarse en un PC real con
// pantalla táctil que el puntero (fino/grueso) daba un falso negativo.

export const PLATFORM = Object.freeze({ WEB: "web", ANDROID: "android", IOS: "ios" });

export const UNAVAILABLE_REASON = Object.freeze({
  IOS_NOT_SUPPORTED: "IOS_NOT_SUPPORTED",
  REQUIRES_ANDROID_APP: "REQUIRES_ANDROID_APP",
  PRINTER_PLUGIN_MISSING: "PRINTER_PLUGIN_MISSING",
});

export const UNAVAILABLE_MESSAGE = Object.freeze({
  [UNAVAILABLE_REASON.IOS_NOT_SUPPORTED]: "Esta impresora (GOOJPRT MTP-II, Bluetooth Clásico) no es compatible con iPhone/iPad. iOS solo permite Bluetooth Clásico a accesorios certificados MFi, y esta impresora no lo está — es una limitación de la impresora/transporte, no de Inspector.",
  [UNAVAILABLE_REASON.REQUIRES_ANDROID_APP]: "La impresión requiere la app Android de Inspector (no funciona desde el navegador/PWA). Instala la app para conectar la impresora Bluetooth.",
  [UNAVAILABLE_REASON.PRINTER_PLUGIN_MISSING]: "El módulo de impresión nativo no está disponible en esta instalación de la app.",
});

export function detectPlatform() {
  if (typeof window === "undefined") return PLATFORM.WEB;
  const capacitor = window.Capacitor;
  if (capacitor && typeof capacitor.getPlatform === "function") {
    const platform = capacitor.getPlatform();
    if (platform === "android") return PLATFORM.ANDROID;
    if (platform === "ios") return PLATFORM.IOS;
  }
  return PLATFORM.WEB;
}

function getNativePrinterPlugin() {
  if (typeof window === "undefined") return null;
  return window.Capacitor?.Plugins?.ParkFacilPrinter || null;
}

// Corrección 2026-08-31: la primera versión de esto usaba
// matchMedia("(pointer: coarse)") (puntero fino vs grueso) para distinguir
// PC de navegador/PWA móvil -- reportado como incorrecto en un PC real
// (mostraba "requiere la app Android" en pleno navegador de escritorio).
// Causa real: "pointer: coarse" refleja el mecanismo de entrada PRIMARIO,
// no el sistema operativo -- cualquier PC con pantalla táctil (portátiles
// 2-en-1, all-in-one, monitores táctiles, comunes en Windows) puede
// evaluar coarse aunque sea un PC real con teclado/mouse, dando exactamente
// este falso negativo. Sistema operativo vía user-agent es la señal
// correcta aquí: un PC (Windows/Mac/Linux) nunca declara "Android" ni
// "iPhone/iPad/iPod" en su user-agent sin importar si tiene pantalla
// táctil, así que no hereda ese problema. Deliberadamente no es sniffing
// de navegador/versión (frágil, no es lo que se necesita) -- solo lee el
// sistema operativo, exactamente lo que distingue "PC real" de "teléfono".
function isLikelyMobileOS() {
  // "window" (no "navigator") es la señal correcta de SSR/servidor: Node
  // expone su PROPIO navigator.userAgent global ("Node.js/x"), así que
  // comprobar solo navigator no detectaría el render en servidor -- window
  // sí está genuinamente ausente ahí, igual que en detectPlatform() arriba.
  if (typeof window === "undefined" || typeof navigator === "undefined") return true; // SSR-safe: mismo valor por defecto que ya tenía la función anterior (no es de escritorio).
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

// true en tres casos: Android empaquetado con Capacitor Y con el plugin
// nativo registrado; o navegador de escritorio (PC, vía el agente local
// existente -- ver printCourtesyFineViaPcAgent). Nunca en iOS, nunca en
// navegador/PWA móvil (ahí no existe ningún transporte real: ni el plugin
// Android, ni el agente de PC, que no podría correr en un teléfono).
export function isPrintingAvailable() {
  const platform = detectPlatform();
  if (platform === PLATFORM.ANDROID) return Boolean(getNativePrinterPlugin());
  if (platform === PLATFORM.WEB) return !isLikelyMobileOS();
  return false;
}

// Por qué NO está disponible ahora mismo (para mostrar el mensaje
// correcto en la UI) -- solo tiene sentido llamarlo cuando
// isPrintingAvailable() es false. No distingue PC-sin-agente aquí: esa
// falla se descubre recién al intentar imprimir (ver
// printCourtesyFineViaPcAgent/AGENT_UNREACHABLE), no de antemano -- un PC
// que abre el agente después de cargar la pantalla no debe quedar
// bloqueado sin recargar.
export function unavailableReason() {
  const platform = detectPlatform();
  if (platform === PLATFORM.IOS) return UNAVAILABLE_REASON.IOS_NOT_SUPPORTED;
  if (platform === PLATFORM.WEB) return UNAVAILABLE_REASON.REQUIRES_ANDROID_APP;
  return UNAVAILABLE_REASON.PRINTER_PLUGIN_MISSING;
}

function requirePlugin() {
  const plugin = getNativePrinterPlugin();
  if (!plugin) throw new Error(UNAVAILABLE_REASON.PRINTER_PLUGIN_MISSING);
  return plugin;
}

// Dispositivos Bluetooth Clásico YA EMPAREJADOS con el teléfono (el
// emparejamiento en sí -- PIN/confirmación -- ocurre una sola vez en los
// Ajustes de Bluetooth de Android, no dentro de Inspector; esto solo
// LISTA lo ya emparejado para elegir cuál usar como impresora). Evita
// pedir el permiso de ubicación que sí exigiría un escaneo en vivo.
export async function listPairedPrinters() {
  const result = await requirePlugin().listPairedDevices();
  return Array.isArray(result?.devices) ? result.devices : [];
}

export async function connectPrinter(deviceId) {
  const result = await requirePlugin().connect({ deviceId });
  return { ok: Boolean(result?.ok), code: result?.code || "", message: result?.message || "" };
}

export async function disconnectPrinter() {
  const plugin = getNativePrinterPlugin();
  if (!plugin) return;
  await plugin.disconnect();
}

export async function getPrinterStatus() {
  const plugin = getNativePrinterPlugin();
  if (!plugin) return { connected: false, deviceId: null, deviceName: null };
  const result = await plugin.getStatus();
  return { connected: Boolean(result?.connected), deviceId: result?.deviceId || null, deviceName: result?.deviceName || null };
}

function uint8ArrayToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Imprime bytes ESC/POS ya construidos (ver courtesyTicketEscPos.mjs) en
// la impresora conectada. Puramente local (JS <-> plugin nativo <->
// Bluetooth Classic SPP): nunca llama a ningún endpoint de ParkFacil, así
// que un error acá jamás puede tocar la fiscalización ya confirmada.
export async function printBytes(bytes) {
  const result = await requirePlugin().printBytes({ dataBase64: uint8ArrayToBase64(bytes) });
  return { ok: Boolean(result?.ok), code: result?.code || "", message: result?.message || "" };
}

// Agente local de impresión de PC (ParkFacil Print Agent): MISMO agente,
// MISMA URL y MISMO token que ya usa POS -- ver
// src/components/pos/PosTerminal.js (PRINT_AGENT_URL/PRINT_AGENT_TOKEN/
// tryLocalAgentPrint), del que este helper es una copia deliberada del
// mismo contrato HTTP (un solo agente físico por PC, compartido por
// cualquier app ParkFacil que corra en esa máquina -- no se crea un
// segundo agente ni un segundo esquema de auth). Nunca toca la
// fiscalización: es una llamada HTTP local independiente, después de que
// el registro ya quedó confirmado por el servidor.
const PRINT_AGENT_URL = "http://127.0.0.1:19100/print";
// Token de emparejamiento del agente local (mismo piloto que POS, no es un
// secreto de producción: el agente solo escucha en localhost de esta misma
// máquina). Ver nota equivalente en PosTerminal.js.
const PRINT_AGENT_TOKEN = "p9tMJvWWvuN70lKB4JLiGK98wS9o-buE";
const PRINT_AGENT_TIMEOUT_MS = 15000;

// Imprime el ticket "MULTA DE CORTESÍA" vía el agente de PC (payload ya
// construido por courtesyTicketAgentPayload() -- ver
// courtesyTicketEscPos.mjs). AGENT_UNREACHABLE (agente no abierto en este
// equipo, o Print Agent no está corriendo) se reporta como cualquier otro
// resultado no-ok, nunca como excepción sin manejar -- la fiscalización ya
// confirmada nunca se ve afectada por esto.
export async function printCourtesyFineViaPcAgent(payload) {
  if (!payload) return { attempted: false, ok: false };
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), PRINT_AGENT_TIMEOUT_MS) : null;
  try {
    const response = await fetch(PRINT_AGENT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-parkfacil-agent-token": PRINT_AGENT_TOKEN },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });
    const result = await response.json().catch(() => ({}));
    return {
      attempted: true,
      ok: response.ok && Boolean(result.ok),
      code: result.code ? String(result.code) : "",
      message: result.message ? String(result.message) : "",
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      code: "AGENT_UNREACHABLE",
      message: "El agente de impresión de PC no está disponible. Verifica que ParkFacil Print Agent esté abierto en este equipo.",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Persistencia de la impresora autorizada (§8 del requerimiento: "reducir
// pasos en las siguientes fiscalizaciones", "No guardar secretos"). Solo
// guarda deviceId (dirección MAC Bluetooth, visible igualmente en los
// Ajustes de Bluetooth del teléfono) y un nombre para mostrar -- nunca un
// token ni una credencial. localStorage es privado al dispositivo del
// inspector, nunca sincronizado a un servidor.
const STORAGE_KEY = "parkfacil-inspector-printer";

export function getSavedPrinter() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSelectedPrinter({ deviceId, deviceName }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ deviceId, deviceName }));
  } catch {
    // localStorage no disponible (modo privado, cuota llena, etc.) -- la
    // app sigue funcionando, solo pide reconectar cada vez.
  }
}

export function clearSavedPrinter() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ver nota de saveSelectedPrinter.
  }
}
