// Enum de vistas del shell de Inspectores (mismo patrón que POS_VIEWS en
// PosTerminal.js): una sola ruta /inspector, navegación por estado de
// cliente -- no rutas Next.js anidadas. Vive en un .mjs sin imports "@/" ni
// JSX para poder testear la lógica de navegación en directo con node --test.
export const INSPECTOR_VIEW = Object.freeze({
  CONSULTA: "CONSULTA",
  RESULTADO: "RESULTADO",
  FISCALIZACION: "FISCALIZACION",
  FISCALIZACIONES: "FISCALIZACIONES",
  HISTORIAL: "HISTORIAL",
  MOROSOS: "MOROSOS",
  MAPA: "MAPA",
  SYNC: "SYNC",
  AJUSTES: "AJUSTES",
  SMS_REPORT: "SMS_REPORT",
});

// A qué item de la barra inferior/sidebar corresponde resaltarse como
// "activo" para cada vista real -- RESULTADO y FISCALIZACION son vistas de
// detalle alcanzadas DESDE Consultar/Fiscalizaciones, así que heredan su
// resaltado en vez de no resaltar nada.
const ACTIVE_NAV_FOR_VIEW = Object.freeze({
  [INSPECTOR_VIEW.RESULTADO]: INSPECTOR_VIEW.CONSULTA,
  [INSPECTOR_VIEW.FISCALIZACION]: INSPECTOR_VIEW.FISCALIZACIONES,
});

export function activeNavView(view) {
  return ACTIVE_NAV_FOR_VIEW[view] || view;
}
