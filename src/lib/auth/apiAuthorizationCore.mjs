import { AuthorizationError } from "./contextCore.mjs";
import { hasPermission, ROLES } from "./permissions.mjs";

export function requirePermission(context, permission) {
  if (!hasPermission(context?.role, permission)) {
    throw new AuthorizationError("PERMISSION_FORBIDDEN", 403, "No tienes permiso para realizar esta acción.", context || null);
  }
  return context;
}

export function requirePlatformAdmin(context) {
  if (context?.role !== ROLES.PLATFORM_ADMIN || context?.portal !== "root") {
    throw new AuthorizationError("PLATFORM_ADMIN_REQUIRED", 403, "Esta acción es exclusiva de ParkFacil Root.", context || null);
  }
  return context;
}

export function requireCompanyResource(context, resourceCompanyId) {
  if (context?.role === ROLES.PLATFORM_ADMIN && context?.portal === "root") return context;
  if (!resourceCompanyId || context?.companyId !== resourceCompanyId) {
    throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontró el recurso solicitado.", context || null);
  }
  return context;
}

export function companyScope(context) {
  return context?.role === ROLES.PLATFORM_ADMIN ? null : context?.companyId || null;
}
