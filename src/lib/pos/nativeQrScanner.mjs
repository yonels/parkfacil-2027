// Salida por QR en la TUU PRO2: el APK lee el QR con la cámara nativa
// (window.ParkFacilDevice.scanQr) porque la cámara del WebView 83
// (getUserMedia) cerraba la app. scanQr() solo confirma que el escáner se
// abrió; el texto leído llega después vía window.ParkFacilQrResult(json).
// Recibe `win` para poder testearlo sin navegador.

export function hasNativeQrScanner(win) {
  const bridge = win && win.ParkFacilDevice;
  return Boolean(bridge && typeof bridge.scanQr === "function");
}

function parse(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Resultado: { ok: true, value } | { ok: false, cancelled: true }
// | { ok: false, unsupported: true } (APK sin escáner) | { ok: false, error }.
export function scanQrWithNativeScanner(win, { timeoutMs = 120000 } = {}) {
  if (!hasNativeQrScanner(win)) return Promise.resolve({ ok: false, unsupported: true });
  return new Promise((resolve) => {
    const previous = win.ParkFacilQrResult;
    let settled = false;
    let timer = null;
    const done = (result) => {
      if (settled) return;
      settled = true;
      if (timer) win.clearTimeout(timer);
      win.ParkFacilQrResult = previous;
      resolve(result);
    };
    win.ParkFacilQrResult = (raw) => {
      const result = parse(raw);
      if (result && result.ok === true && typeof result.value === "string" && result.value.trim()) {
        done({ ok: true, value: result.value.trim() });
      } else if (result && result.cancelled) {
        done({ ok: false, cancelled: true });
      } else {
        done({ ok: false, error: "invalid_result" });
      }
    };
    timer = win.setTimeout(() => done({ ok: false, error: "timeout" }), timeoutMs);

    let ack = null;
    try {
      ack = parse(win.ParkFacilDevice.scanQr());
    } catch {
      ack = null;
    }
    if (!ack || ack.ok !== true) {
      done(ack && ack.error === "not_implemented" ? { ok: false, unsupported: true } : { ok: false, error: (ack && ack.error) || "launch_failed" });
    }
  });
}
