// Off Street — Fase 6: estimación simple de luminancia para el aviso de
// "poca iluminación" en la captura de patente (§10 del encargo). Deliberada
// y explícitamente NO es visión artificial: es un promedio de luma sobre
// los píxeles ya muestreados (el llamador decide cuántos/cada cuánto,
// normalmente un canvas de muestreo bien pequeño) -- ninguna dependencia
// nueva, ningún modelo. Pura/sin DOM para ser 100% unit-testeable (mismo
// criterio que el resto de módulos "*Core.mjs"/pure de este proyecto).

// Umbral en escala 0-255 (luma Rec. 601). Elegido para separar "ambiente
// interior con luz normal" (~90-180) de "oscuro/contraluz" (<60) sin ser
// tan sensible que dispare el aviso con cualquier sombra momentánea.
export const LOW_LIGHT_LUMINANCE_THRESHOLD = 60;

// pixels: Uint8ClampedArray/array plano RGBA (ImageData.data). Promedia el
// luma de Rec. 601 (0.299R + 0.587G + 0.114B) -- misma fórmula estándar
// usada para "escala de grises perceptual", sin canal alfa.
export function averageLuminance(pixels) {
  if (!pixels || !pixels.length) return null;
  let sum = 0;
  let count = 0;
  for (let i = 0; i + 2 < pixels.length; i += 4) {
    sum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    count += 1;
  }
  return count > 0 ? sum / count : null;
}

export function isLowLight(luminance, threshold = LOW_LIGHT_LUMINANCE_THRESHOLD) {
  if (luminance === null || luminance === undefined || Number.isNaN(luminance)) return false;
  return luminance < threshold;
}
