import { AuthorizationError } from "./contextCore.mjs";
import { ROLES } from "./permissions.mjs";

export function parkingQueryScope(context, assignedParkingIds = []) {
  if (context?.role === ROLES.PLATFORM_ADMIN && context?.portal === "root") return { companyId: null, parkingIds: null };
  if (context?.role === ROLES.COMPANY_ADMIN && context?.portal === "client") return { companyId: context.companyId, parkingIds: null };
  if (context?.role === ROLES.OPERATOR && context?.portal === "client") return { companyId: context.companyId, parkingIds: [...new Set(assignedParkingIds)] };
  throw new AuthorizationError("PARKING_ACCESS_FORBIDDEN", 403, "No tienes permiso para acceder a estacionamientos.", context || null);
}

export function requireParkingChildRow(context, row) {
  if (!row) throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontró el recurso solicitado.", context || null);
  return row;
}

export function requireAssignedOperator(context, member, assigned) {
  if (!member || member.status !== "active" || member.role !== ROLES.OPERATOR || member.company_id !== context.companyId || !assigned) {
    throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontró el operador solicitado.", context || null);
  }
  return member;
}
