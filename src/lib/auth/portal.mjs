export const PORTALS = Object.freeze({ ROOT: "root", CLIENT: "client" });

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
  return getPortalFromHost(request?.headers?.get?.("x-forwarded-host") || request?.headers?.get?.("host"));
}
