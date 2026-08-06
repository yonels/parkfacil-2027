export const ROLES = Object.freeze({
  PLATFORM_ADMIN: "platform_admin",
  COMPANY_ADMIN: "company_admin",
  OPERATOR: "operator",
});

export const PERMISSIONS = Object.freeze({
  PLATFORM_GLOBAL: "platform:global",
  COMPANY_READ: "company:read",
  COMPANY_MANAGE: "company:manage",
  USERS_MANAGE: "users:manage",
  PARKINGS_READ: "parkings:read",
  PARKINGS_MANAGE: "parkings:manage",
  OPERATIONS_USE: "operations:use",
  REPORTS_READ: "reports:read",
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.PLATFORM_ADMIN]: new Set(Object.values(PERMISSIONS)),
  [ROLES.COMPANY_ADMIN]: new Set([
    PERMISSIONS.COMPANY_READ,
    PERMISSIONS.COMPANY_MANAGE,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.PARKINGS_READ,
    PERMISSIONS.PARKINGS_MANAGE,
    PERMISSIONS.OPERATIONS_USE,
    PERMISSIONS.REPORTS_READ,
  ]),
  [ROLES.OPERATOR]: new Set([
    PERMISSIONS.COMPANY_READ,
    PERMISSIONS.PARKINGS_READ,
    PERMISSIONS.OPERATIONS_USE,
  ]),
});

export function hasPermission(role, permission) {
  return ROLE_PERMISSIONS[role]?.has(permission) === true;
}

export function permissionsForRole(role) {
  return [...(ROLE_PERMISSIONS[role] || [])];
}

const ROOT_ONLY_PREFIXES = ["/empresas", "/contratos", "/modelo-gestion-modulos"];
const COMPANY_ADMIN_PREFIXES = ["/usuarios"];

function matchesPrefix(pathname, prefixes) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function canAccessPath({ portal, role }, pathname) {
  if (role === ROLES.PLATFORM_ADMIN) {
    return portal === "root";
  }
  if (![ROLES.COMPANY_ADMIN, ROLES.OPERATOR].includes(role) || portal !== "client") {
    return false;
  }
  if (matchesPrefix(pathname, ROOT_ONLY_PREFIXES)) return false;
  if (matchesPrefix(pathname, COMPANY_ADMIN_PREFIXES)) return role === ROLES.COMPANY_ADMIN;
  return true;
}

export function navigationVisibleForRole(item, context) {
  return Boolean(item?.href && context) && canAccessPath(context, item.href.split("#")[0]);
}
