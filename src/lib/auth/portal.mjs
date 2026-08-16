export const PORTALS = Object.freeze({ ROOT: "root", CLIENT: "client", TERMINAL: "terminal" });

export function normalizeHost(value) {
  return String(value || "").split(":")[0].trim().toLowerCase();
}

export function getPortalFromHost(value) {
  const host = normalizeHost(value);
  if (host === "cliente.parkfacilapp.cl" || host === "cliente.localhost") {
    return PORTALS.CLIENT;
  }
  return PORTALS.ROOT;
}

export function getRequestPortal(request) {
  const explicitPortal = String(request?.headers?.get?.("x-parkfacil-portal") || "").trim().toLowerCase();
  const pathname = (() => {
    try { return new URL(request?.url || "http://localhost").pathname; } catch { return ""; }
  })();
  // Terminal es un contexto de privilegios reducidos. Reconocerlo por ruta o cabecera
  // no concede acceso: la membresía, operations:use y el parking se validan después.
  if (pathname === "/pos" || pathname.startsWith("/pos/") || explicitPortal === PORTALS.TERMINAL) {
    return PORTALS.TERMINAL;
  }
  return getPortalFromHost(request?.headers?.get?.("x-forwarded-host") || request?.headers?.get?.("host"));
}
