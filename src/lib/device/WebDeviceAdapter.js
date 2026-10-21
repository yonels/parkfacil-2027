import { ParkFacilDevice } from "@/lib/device/ParkFacilDevice";

export class WebDeviceAdapter extends ParkFacilDevice {
  async getDeviceInfo() {
    return {
      platform: "web",
      userAgent: navigator.userAgent,
      language: navigator.language,
      standalone: window.matchMedia?.("(display-mode: standalone)").matches === true,
    };
  }

  async getCapabilities() {
    return {
      print: typeof window.print === "function",
      scanQr: "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia),
      networkStatus: true,
      nativePrint: false,
      secureDeviceIdentity: false,
    };
  }

  async print({ html, windowName = "parkfacil-print", features = "width=420,height=720" } = {}) {
    if (!html) throw new Error("Se requiere contenido HTML para imprimir.");
    const popup = window.open("", windowName, features);
    if (!popup) throw new Error("Permite ventanas emergentes para imprimir.");
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 250);
    return { method: "web-print" };
  }

  async scanQr({ video, signal } = {}) {
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Este navegador no admite lectura QR por cámara.");
    }
    if (!video) throw new Error("Se requiere un elemento de video para leer el QR.");

    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
    await video.play();
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

    try {
      while (!signal?.aborted) {
        const codes = await detector.detect(video).catch(() => []);
        if (codes[0]?.rawValue) return codes[0].rawValue;
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
      }
      throw new DOMException("Lectura cancelada.", "AbortError");
    } finally {
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
  }

  async getNetworkStatus() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
      online: navigator.onLine,
      effectiveType: connection?.effectiveType || null,
      downlink: connection?.downlink || null,
      saveData: connection?.saveData || false,
    };
  }
}

export const webDevice = new WebDeviceAdapter();
