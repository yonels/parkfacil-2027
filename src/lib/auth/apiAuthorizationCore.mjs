import { AuthorizationError } from "./contextCore.mjs";
import { hasEnabledProduct, hasPermission, ROLES } from "./permissions.mjs";

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

// Punto único de autorización por producto para rutas API (ver §33/§34 de la
// auditoría "ACCESO DIFERENCIADO OFF-STREET / ON-STREET": no duplicar esta
// verificación por endpoint). Root queda exento siempre -- administra ambos
// productos sin restricción de empresa.
export function requireProduct(context, product) {
  if (context?.role === ROLES.PLATFORM_ADMIN) return context;
  if (!hasEnabledProduct(context?.enabledProducts, product)) {
    throw new AuthorizationError("PRODUCT_NOT_ENABLED", 403, "Tu empresa no tiene este producto habilitado.", context || null);
  }
  return context;
}
