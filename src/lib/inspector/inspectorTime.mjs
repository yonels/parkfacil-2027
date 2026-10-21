// Formato de tiempo para ParkFacil Inspectores: tiempo relativo ("Hace X
// min") para Últimas consultas/Historial, y cuenta regresiva/vencida para la
// ficha de resultado. Funciones puras, deliberadamente propias del módulo
// (no importadas de onStreetPilot.mjs) para no acoplar Inspectores a las
// reglas de otro producto -- son unos pocos cálculos triviales, no vale la
// pena la dependencia cruzada.

export function relativeTimeFromNow(isoDate, now = Date.now()) {
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return "—";
  const diffSeconds = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSeconds < 60) return "Hace instantes";
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} d`;
}

export function remainingInspectorSeconds(expiresAtIso, now = Date.now()) {
  return Math.max(0, Math.floor((new Date(expiresAtIso).getTime() - now) / 1000));
}

export function overdueInspectorSeconds(expiresAtIso, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(expiresAtIso).getTime()) / 1000));
}

export function formatInspectorDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${hours} h ${minutes} min`;
  if (minutes) return `${minutes} min`;
  return `${total} s`;
}
