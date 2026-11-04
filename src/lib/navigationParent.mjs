export function getParentHref(pathname) {
  const segments = String(pathname || "").split("/").filter(Boolean);
  if (!segments.length) return null;
  if (segments[0] === "login") return null;
  if (segments[0] === "simulador-tarifas") return "/modelo-dashboard";
  if (segments[0] === "cierres-turno") return "/operacion";
  if (segments[0] === "turnos" && segments.at(-1) === "cerrar") return "/operacion";

  // Pasos del configurador (SOL-2026-11-04-002): «Volver» regresa a él, no a la ficha.
  if (segments[0] === "estacionamientos" && segments.length === 3 && ["tarifas", "niveles"].includes(segments[2])) {
    return `/estacionamientos/${segments[1]}/configuracion`;
  }

  const last = segments.at(-1);
  const previous = segments.at(-2);
  if (["nuevo", "nueva"].includes(last) && ["calles", "zonas"].includes(previous)) {
    return `/${segments.slice(0, -2).join("/")}`;
  }

  return segments.length === 1 ? "/" : `/${segments.slice(0, -1).join("/")}`;
}
