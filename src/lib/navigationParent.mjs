export function getParentHref(pathname) {
  const segments = String(pathname || "").split("/").filter(Boolean);
  if (!segments.length) return null;
  if (segments[0] === "login") return null;
  if (segments[0] === "simulador-tarifas") return "/modelo-dashboard";
  if (segments[0] === "cierres-turno") return "/operacion";
  if (segments[0] === "turnos" && segments.at(-1) === "cerrar") return "/operacion";

  const last = segments.at(-1);
  const previous = segments.at(-2);
  if (["nuevo", "nueva"].includes(last) && ["calles", "zonas"].includes(previous)) {
    return `/${segments.slice(0, -2).join("/")}`;
  }

  return segments.length === 1 ? "/" : `/${segments.slice(0, -1).join("/")}`;
}
