// POS Entry/Exit — fotografía de patente para el ticket térmico (PT-210 /
// MTP-II 58 mm). Convierte la foto ya capturada (el mismo recorte JPEG de
// PlatePhotoCapture, nunca una foto nueva) en un raster monocromo listo para
// ESC/POS "GS v 0", que el agente local de impresión envía por bandas.
//
// Se convierte en el navegador para que el agente no necesite decodificar
// JPEG: el raster de 384 x ~139 dots pesa ~6,7 KB (vs. ~300 KB del JPEG).
//
// Reglas:
// - ancho máximo 384 dots (ancho útil validado en la PT-210), nunca se
//   agranda la imagen; proporción preservada (sin deformar ni recortar);
// - alto acotado (maxHeight) reduciendo ambos ejes por igual;
// - monocromo con autonivelado + difusión de error Floyd–Steinberg, para
//   que los caracteres de la patente sigan legibles.

export const TICKET_RASTER_MAX_WIDTH = 384;
export const TICKET_RASTER_MAX_HEIGHT = 240;

export function fitTicketRasterSize(width, height, maxWidth = TICKET_RASTER_MAX_WIDTH, maxHeight = TICKET_RASTER_MAX_HEIGHT) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0) || !(h > 0)) return null;
  let scale = Math.min(1, maxWidth / w);
  if (h * scale > maxHeight) scale = maxHeight / h;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

// rgba: Uint8ClampedArray/array de width*height*4. Devuelve
// { widthBytes, height, bitmap: Uint8Array } con bit=1 = punto negro.
export function rgbaToMonochromeRaster(rgba, width, height) {
  const count = width * height;
  const gray = new Float32Array(count);
  let min = 255;
  let max = 0;
  for (let i = 0; i < count; i += 1) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3] ?? 255;
    // Transparente = papel (blanco).
    const luma = a === 0 ? 255 : 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = luma;
    if (luma < min) min = luma;
    if (luma > max) max = luma;
  }
  // Autonivelado: estira el rango real de la foto a 0..255 (fotos con poca
  // luz o lavadas conservan contraste en papel térmico).
  const range = max - min;
  if (range > 16) {
    for (let i = 0; i < count; i += 1) gray[i] = ((gray[i] - min) * 255) / range;
  }

  const widthBytes = Math.ceil(width / 8);
  const bitmap = new Uint8Array(widthBytes * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const old = gray[index];
      const black = old < 128;
      if (black) bitmap[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      const error = old - (black ? 0 : 255);
      if (x + 1 < width) gray[index + 1] += (error * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) gray[index + width - 1] += (error * 3) / 16;
        gray[index + width] += (error * 5) / 16;
        if (x + 1 < width) gray[index + width + 1] += error / 16;
      }
    }
  }
  return { widthBytes, height, bitmap };
}

export function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Solo navegador: data URL (JPEG) -> { widthBytes, height, data (base64) }.
// Devuelve null ante cualquier fallo: el ticket se imprime igual, con la
// patente en texto grande (fallback obligatorio).
export async function photoToTicketRaster(dataUrl, options = {}) {
  try {
    if (!dataUrl || typeof document === "undefined") return null;
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = dataUrl;
    });
    const size = fitTicketRasterSize(img.naturalWidth || img.width, img.naturalHeight || img.height, options.maxWidth, options.maxHeight);
    if (!size) return null;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(img, 0, 0, size.width, size.height);
    const { data } = ctx.getImageData(0, 0, size.width, size.height);
    const raster = rgbaToMonochromeRaster(data, size.width, size.height);
    return { widthBytes: raster.widthBytes, height: raster.height, data: bytesToBase64(raster.bitmap) };
  } catch {
    return null;
  }
}
