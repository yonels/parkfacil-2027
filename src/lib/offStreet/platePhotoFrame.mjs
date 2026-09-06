// Off Street — Fase 6: recuadro fijo de encuadre/recorte de la patente.
// Patente chilena estándar: 360mm x 130mm + 10% de holgura = 396mm x
// 143mm -- razón de aspecto ancho:alto ~2,77:1 (396/143 exacto). Única
// fuente de verdad de esa proporción: la usa tanto el recuadro guía que se
// dibuja sobre el video en vivo (PlatePhotoCapture.js, misma razón exacta
// vía CSS aspect-ratio) como el recorte real que se guarda como evidencia
// -- así nunca pueden desalinearse ("lo que se ve en cámara es exactamente
// lo que se recorta y se guarda").
// Sin dependencias de DOM/canvas para que sea 100% unit-testeable (mismo
// criterio que offStreetPlatePhoto.mjs).

export const PLATE_FRAME_ASPECT = 396 / 143;

// 88% del ancho de la fuente: dentro de ese marco (más el 10% de holgura ya
// incluido en 396x143 frente a la patente real de 360x130) queda el
// pequeño margen visual uniforme alrededor de la patente pedido en el
// encargo -- no es un valor aparte, es consecuencia directa de usar el
// tamaño "patente + holgura" como marco.
const FRAME_WIDTH_RATIO = 0.88;

// Tope defensivo de alto -- ninguna razón de aspecto de cámara real
// (siempre <= ~1,8:1, sea en horizontal u vertical) lo activa; existe para
// que una imagen ya subida con una razón de aspecto extrema (ej. un
// recorte manual previo muy angosto) nunca produzca un marco más alto que
// la propia fuente.
const FRAME_MAX_HEIGHT_RATIO = 0.7;

// Calcula el rectángulo del marco (en las mismas unidades que
// sourceWidth/sourceHeight: px CSS del video en vivo, o px nativos de una
// imagen ya decodificada) SIEMPRE con razón PLATE_FRAME_ASPECT, centrado.
// Nunca deforma: si el alto derivado del 88% de ancho excede el tope, se
// recalcula el ancho a partir de ese alto -- la razón nunca cambia.
export function computePlateFrameRect(sourceWidth, sourceHeight) {
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return null;

  const maxWidth = sourceWidth * FRAME_WIDTH_RATIO;
  const maxHeight = sourceHeight * FRAME_MAX_HEIGHT_RATIO;

  let width = maxWidth;
  let height = width / PLATE_FRAME_ASPECT;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * PLATE_FRAME_ASPECT;
  }

  return {
    x: (sourceWidth - width) / 2,
    y: (sourceHeight - height) / 2,
    width,
    height,
  };
}

// Dimensiones de salida (enteras) del recorte, preservando SIEMPRE la
// proporción del marco -- nunca estira un eje más que el otro. Solo achica
// (nunca agranda: no se inventa resolución que la fuente no tiene).
// maxOutputWidth acota el tamaño final a algo suficiente para leer los
// caracteres con claridad sin generar archivos innecesariamente grandes.
export function computePlateCropOutputSize(frame, maxOutputWidth) {
  if (!frame || !(maxOutputWidth > 0)) return null;
  if (frame.width <= maxOutputWidth) {
    return { width: Math.round(frame.width), height: Math.round(frame.height) };
  }
  const scale = maxOutputWidth / frame.width;
  return { width: Math.round(maxOutputWidth), height: Math.round(frame.height * scale) };
}
