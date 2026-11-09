// PDF recibido de Haulmer en la misma respuesta de la emisión (SOL-2026-11-05-005, 2026-11-09).
// Medido en dev-api: emitir y pedir el PDF aparte tomaba ~48 s (Haulmer responde 500 mientras lo genera); pedirlo en la
// emisión («response»: [..., "PDF"]) lo entrega en ~1,4 s. Se guarda unos minutos en memoria del servidor para que el
// correo (que corre en la misma solicitud) y «Ver PDF» no vuelvan a pedirlo. Si no está, se pide a Haulmer como antes.
const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 50;
const cache = new Map();

export function rememberIssuedPdf(token, pdfBase64) {
  if (!token || typeof pdfBase64 !== "string" || !pdfBase64) return;
  cache.delete(token);
  cache.set(token, { pdf: pdfBase64, at: Date.now() });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

export function cachedIssuedPdf(token, now = Date.now()) {
  const entry = cache.get(token);
  if (!entry) return null;
  if (now - entry.at > TTL_MS) { cache.delete(token); return null; }
  return entry.pdf;
}
