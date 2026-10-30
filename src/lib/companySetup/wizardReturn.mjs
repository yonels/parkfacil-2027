// «Volver» al asistente de «Configurar empresa» (SOL-2026-10-29-014). Cuando el
// asistente abre la pantalla actual de un paso (Tarifas, Zonas, Activación,
// Turnos…), deja una marca en sessionStorage; el botón «Volver» de esa
// pantalla regresa entonces al asistente en vez de ir a su página padre.
// Solo aplica en la pantalla exacta que abrió el asistente (las páginas más
// internas conservan su «Volver» de siempre) y por un tiempo acotado.

export const WIZARD_RETURN_KEY = "pf-configurar-empresa-volver";
export const WIZARD_RETURN_TTL_MS = 2 * 60 * 60 * 1000;

const pathOf = (href) => String(href || "").split(/[?#]/)[0].replace(/\/+$/, "") || "/";

// stepHref: pantalla que se abre; returnTo: URL del asistente a la que volver.
export function buildWizardReturnMarker(stepHref, returnTo, now = Date.now()) {
  return { path: pathOf(stepHref), returnTo, at: now };
}

// Destino de «Volver» para pathname, o null si no corresponde.
export function resolveWizardReturnHref(marker, pathname, now = Date.now()) {
  if (!marker || typeof marker !== "object") return null;
  if (typeof marker.returnTo !== "string" || !marker.returnTo.startsWith("/administracion/configurar-empresa")) return null;
  if (!Number.isFinite(marker.at) || now - marker.at > WIZARD_RETURN_TTL_MS || now < marker.at) return null;
  return pathOf(pathname) === marker.path ? marker.returnTo : null;
}
