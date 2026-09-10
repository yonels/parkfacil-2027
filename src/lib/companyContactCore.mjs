// Validaciones/normalizaciones de datos de contacto de empresa, compartidas
// entre el formulario de creación (cliente) y POST /api/empresas (servidor)
// -- mismo criterio en ambos lados, sin duplicar el regex/reglas dos veces.
// El teléfono fijo (`companies.phone`) siempre fue texto libre en este
// proyecto (ver semillas históricas como "Sin teléfono informado" en
// supabase/migrations/20260729130000_company_contracts_and_access.sql), así
// que aquí se mantiene opcional y sin formato estricto para no romper ese
// precedente -- solo el móvil (campo nuevo) exige formato chileno real.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidContactEmail(value) {
  return EMAIL_PATTERN.test(String(value || "").trim());
}

// Acepta "+56 9 1234 5678", "56912345678", "912345678", con o sin espacios
// o guiones -- normaliza siempre a "+56 9 XXXX XXXX".
export function normalizeChileanMobile(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  const nineDigits = digits.startsWith("56") ? digits.slice(2) : digits;
  if (!/^9\d{8}$/.test(nineDigits)) return { ok: false, value: "", error: "El teléfono móvil debe tener el formato +56 9 XXXX XXXX." };
  return { ok: true, value: `+56 9 ${nineDigits.slice(1, 5)} ${nineDigits.slice(5)}`, error: null };
}

export function normalizeWebsiteUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: true, value: "", error: null };
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (!url.hostname.includes(".")) throw new Error("hostname inválido");
    return { ok: true, value: url.href.replace(/\/$/, ""), error: null };
  } catch {
    return { ok: false, value: "", error: "La URL del sitio web no es válida." };
  }
}
