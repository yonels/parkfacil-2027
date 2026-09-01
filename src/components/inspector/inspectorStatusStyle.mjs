import { INSPECTOR_PLATE_STATUS } from "../../lib/inspector/inspectorMocks.mjs";

// Paleta de estados aprobada para ParkFacil Inspectores: verde VIGENTE, rojo
// VENCIDO, naranja OBSERVADO, gris SIN_SESION. Separado de
// InspectorStatusBadge.js (que tiene JSX y por lo tanto no puede importarse
// directamente con node --test) para poder probarlo, y para que el resto de
// la UI del módulo consuma un único punto de verdad en vez de repetir
// colores.
const STATUS_STYLE = {
  [INSPECTOR_PLATE_STATUS.VIGENTE]: { label: "VIGENTE", chip: "bg-emerald-100 text-emerald-800", stripe: "bg-emerald-600", text: "text-emerald-700" },
  [INSPECTOR_PLATE_STATUS.VENCIDO]: { label: "VENCIDO", chip: "bg-rose-100 text-rose-800", stripe: "bg-rose-600", text: "text-rose-700" },
  [INSPECTOR_PLATE_STATUS.OBSERVADO]: { label: "OBSERVADO", chip: "bg-amber-100 text-amber-900", stripe: "bg-amber-500", text: "text-amber-700" },
  [INSPECTOR_PLATE_STATUS.SIN_SESION]: { label: "SIN SESIÓN", chip: "bg-slate-200 text-slate-700", stripe: "bg-slate-500", text: "text-slate-600" },
};

export function inspectorStatusStyle(status) {
  return STATUS_STYLE[status] || STATUS_STYLE[INSPECTOR_PLATE_STATUS.SIN_SESION];
}
