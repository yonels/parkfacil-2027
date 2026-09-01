"use client";
// Compresión cliente de evidencia fotográfica (Etapa 3, §17/§20): reduce
// fotos de cámaras de teléfono modernas (a menudo >8MB) a un tamaño
// razonable antes de subir, sin destruir la calidad probatoria. Límites
// documentados aquí (coinciden con el techo real del servidor, ver
// inspectorEvidenceRepository.js -- la compresión del cliente es una
// optimización de ancho de banda, NUNCA la garantía real, que vive en el
// servidor):
//   - lado mayor máximo: 1600px (suficiente para leer una patente en la
//     foto sin generar archivos innecesariamente grandes).
//   - calidad JPEG: 0.82 (buen compromiso nitidez/tamaño para evidencia).
// Si el navegador no soporta canvas/File (caso extremo), se sube el
// archivo original sin comprimir -- nunca se bloquea la evidencia por un
// fallo de la optimización.
export const MAX_DIMENSION = 1600;
export const JPEG_QUALITY = 0.82;

export async function compressImageFile(file, { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY } = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") return file;
  try {
    const bitmap = await createImageBitmapSafe(file);
    if (!bitmap) return file;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap.__img || bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;
    // Solo se usa el resultado comprimido si es efectivamente más liviano
    // que el original -- una foto ya pequeña no debe "engordar" por pasar
    // por el canvas.
    return blob.size > 0 && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

async function createImageBitmapSafe(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // sigue al fallback de <img>
    }
  }
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight, __img: img }); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
