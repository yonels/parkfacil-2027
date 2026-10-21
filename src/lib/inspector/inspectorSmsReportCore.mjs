// Núcleo puro del Reporte SMS Inspector (2026-09-03): sin "server-only" ni
// imports "@/..." para poder testearlo en directo con node --test (mismo
// criterio que inspectorSmsStatusMessage.mjs/inspectorPlateStateCore.mjs).
// No toca base de datos, no decide NADA sobre si se envía/reintenta un SMS
// -- solo transforma datos ya obtenidos en la forma que necesita la UI.

// TAREA 5: enmascarado de teléfono -- nunca se expone el número completo en
// la UI normal. phone_normalized siempre viene en el formato canónico
// +569XXXXXXXX (ver sentralandCore.CHILEAN_MOBILE_PATTERN); se muestran
// solo los últimos 4 dígitos, igual criterio que maskAdminPhone
// (onStreetAdminCore.mjs) para el teléfono administrativo -- mismo patrón
// ya establecido en el proyecto, aplicado aquí a un campo distinto.
export function maskInspectorPhone(phone) {
  const raw = String(phone || "").trim();
  const match = raw.match(/^\+569(\d{8})$/);
  if (!match) return raw ? "***" : "—";
  return `+56 9 *** ${match[1].slice(-4)}`;
}

// TAREA 3: "Estado envío" -- basado EXCLUSIVAMENTE en sms_status (lo que
// register_on_street_inspection/sendInspectionSmsIfNeeded ya persisten).
// Nunca se confunde con el estado DLR (ver abajo): "Enviado" aquí SIEMPRE
// significó "el proveedor aceptó la petición", nunca "se entregó" -- ver
// inspectorSmsStatusMessage.mjs, que ya documentaba exactamente esto. Esta
// función solo le pone una etiqueta más explícita para el reporte
// administrativo ("ENVIADO AL PROVEEDOR" en vez de "Enviado" a secas).
export function inspectorSmsSendUiState({ smsRequired, smsStatus } = {}) {
  if (!smsRequired) return { label: "NO REQUERIDO", tone: "neutral" };
  if (smsStatus === "SENT") return { label: "ENVIADO AL PROVEEDOR", tone: "success" };
  if (smsStatus === "FAILED") return { label: "ERROR", tone: "error" };
  return { label: "PENDIENTE", tone: "neutral" };
}

// TAREA 3/4: "Estado DLR" -- basado en sms_delivery_status (columna nueva,
// null hasta la primera consulta explícita de TAREA 8, "Actualizar
// estado"). Traduce el deliveryState real del proveedor
// (mapSentralandDeliveryState en sentralandCore.mjs) a las etiquetas
// pedidas -- ACCEPTED (el proveedor aceptó pero no hay confirmación final
// todavía) y "nunca consultado" comparten la misma etiqueta PENDIENTE
// porque, para quien lee el reporte, ambos significan lo mismo: "todavía
// no hay una confirmación final de entrega".
const DELIVERY_STATE_LABELS = Object.freeze({
  DELIVERED: { label: "ENTREGADO", tone: "success" },
  UNDELIVERED: { label: "NO ENTREGADO", tone: "error" },
  EXPIRED: { label: "EXPIRADO", tone: "error" },
  REJECTED: { label: "RECHAZADO", tone: "error" },
  ACCEPTED: { label: "PENDIENTE", tone: "neutral" },
  UNKNOWN: { label: "DESCONOCIDO", tone: "neutral" },
});

export function inspectorSmsDeliveryUiState({ smsRequired, smsStatus, smsDeliveryStatus } = {}) {
  if (!smsRequired) return { label: "NO APLICA", tone: "neutral" };
  if (smsStatus !== "SENT") return { label: "NO APLICA", tone: "neutral" }; // nunca se aceptó -- no hay nada que consultar
  if (!smsDeliveryStatus) return { label: "PENDIENTE", tone: "neutral" }; // aceptado, DLR nunca consultado todavía
  return DELIVERY_STATE_LABELS[smsDeliveryStatus] || { label: "DESCONOCIDO", tone: "neutral" };
}

// TAREA 9: "Copia inspector" -- reutiliza inspectorCopySmsShortStatus
// (inspectorSmsStatusMessage.mjs), este archivo no la reimplementa. Solo se
// documenta aquí que el reporte SIEMPRE muestra ambas filas (SMS conductor
// y copia inspector) por separado, nunca mezcladas -- mismo criterio que
// InspectorFiscalizacion.js.

// --- Alcance RBAC (2026-09-03, agregado tras revisión) ---
//
// scope: { type: "own", inspectorUserId } -- portal Inspector: SOLO sus
//   propias fiscalizaciones (nunca las de otro inspector).
// scope: { type: "company", parkingIds } -- portal admin, company_admin:
//   acotado a los parkingIds de su empresa (mismo mecanismo que
//   scopedParkings en onStreetAdminRepository.js).
// scope: { type: "global" } -- portal admin, platform_admin únicamente.
//
// Función PURA (sin DB): reutilizada tanto para filtrar la consulta SQL
// (inspectorRepository.js, defensa en profundidad #1) como para
// re-verificar la fila ya traída antes de devolverla en el detalle
// (defensa en profundidad #2) -- la MISMA lógica en ambos puntos, nunca
// dos implementaciones que puedan divergir.
export function inspectorSmsReportRowInScope(row, scope) {
  if (!row) return false;
  if (scope?.type === "own") return row.inspector_user_id === scope.inspectorUserId;
  if (scope?.type === "company") return row.parking_id != null && (scope.parkingIds || []).includes(row.parking_id);
  return scope?.type === "global";
}

// TAREA 6: filtros. period puramente local a este reporte (no reutiliza
// resolvePeriodBounds de onStreetDashboardCore.mjs para no tocar código
// compartido con el dashboard administrativo On Street) -- mismo cálculo de
// fechas, limitado a los 3 rangos pedidos.
export const INSPECTOR_SMS_REPORT_PERIODS = Object.freeze(["today", "7d", "30d"]);

export function resolveInspectorSmsReportPeriod(period, now = new Date()) {
  const end = new Date(now);
  const start = new Date(end);
  if (period === "today") start.setHours(0, 0, 0, 0);
  else if (period === "7d") { start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0); }
  else if (period === "30d") { start.setDate(start.getDate() - 29); start.setHours(0, 0, 0, 0); }
  else return null;
  return { from: start.toISOString(), to: end.toISOString() };
}

// Filtra en memoria (mismas filas ya acotadas por inspector_user_id y
// período en el repositorio) -- patente/teléfono/inspector/estado envío/
// estado DLR. plate y phone son substring case-insensitive (búsqueda
// parcial); status/deliveryStatus son igualdad exacta contra las etiquetas
// ya calculadas por las funciones de arriba, para que el filtro use
// EXACTAMENTE los mismos valores que ve el usuario en pantalla.
export function filterInspectorSmsReportRows(rows, filters = {}) {
  const plate = String(filters.plate || "").trim().toUpperCase();
  const phone = String(filters.phone || "").replace(/\D/g, "");
  const sendStatus = filters.sendStatus || "";
  const deliveryStatus = filters.deliveryStatus || "";
  return rows.filter((row) => {
    if (plate && !row.plate.toUpperCase().includes(plate)) return false;
    if (phone && !String(row.phone || "").replace(/\D/g, "").includes(phone)) return false;
    if (sendStatus && inspectorSmsSendUiState(row).label !== sendStatus) return false;
    if (deliveryStatus && inspectorSmsDeliveryUiState(row).label !== deliveryStatus) return false;
    return true;
  });
}
