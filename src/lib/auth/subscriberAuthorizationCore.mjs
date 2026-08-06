import { AuthorizationError } from "./contextCore.mjs";
import { ROLES } from "./permissions.mjs";

export const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

export function subscriberQueryScope(context, assignedParkingIds = []) {
  if (context?.role === ROLES.PLATFORM_ADMIN) return {};
  const scope = { companyId: context?.companyId || null };
  if (context?.role === ROLES.OPERATOR) scope.parkingIds = [...new Set(assignedParkingIds.filter(Boolean))];
  return scope;
}

export function requireSubscriberRow(context, row) {
  if (!row) throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontro el abonado solicitado.", context);
  return row;
}

export function requireSubscriberParking(context, parking, companyId) {
  if (!parking || (companyId && parking.company_id !== companyId)) {
    throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontro el estacionamiento solicitado.", context);
  }
  return parking;
}
