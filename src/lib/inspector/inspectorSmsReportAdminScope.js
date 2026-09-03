import "server-only";
import { ROLES } from "@/lib/auth/permissions.mjs";
import { scopedParkings } from "@/lib/onStreetAdminRepository";

// Resuelve el `scope` del Reporte SMS Inspector para el backoffice admin
// (§2/§3 del pedido de alcance RBAC, 2026-09-03): reutiliza scopedParkings
// (onStreetAdminRepository.js), el mismo mecanismo YA usado por el resto
// del módulo On Street admin (/api/on-street-qr/fiscalizaciones, dashboard,
// etc.) para acotar por empresa -- no se inventa un segundo camino de
// scoping. platform_admin -> "global" (scopedParkings sin companyId no
// filtra). company_admin -> "company" con exactamente los parkingIds de SU
// empresa (scopedParkings ya resuelve esto vía context.companyId, nunca
// confía en un companyId que llegara del cliente). Esta función solo la
// llaman rutas ya protegidas por authorizeOnStreetAdminRequest (platform_
// admin/company_admin únicamente, ON_STREET_QR_READ) -- ver ese archivo
// para el candado real; aquí no se repite el chequeo de rol.
export async function resolveInspectorSmsReportAdminScope(db, context) {
  if (context.role === ROLES.PLATFORM_ADMIN) return { type: "global" };
  const parkings = await scopedParkings(db, context, null);
  return { type: "company", parkingIds: parkings.map((p) => p.id) };
}
