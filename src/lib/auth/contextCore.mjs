import { hasPermission, PERMISSIONS, resolveEnabledProducts, ROLES } from "./permissions.mjs";

export class AuthorizationError extends Error {
  constructor(code, status, message, auditContext = null) {
    super(message);
    this.name = "AuthorizationError";
    this.code = code;
    this.status = status;
    this.auditContext = auditContext;
  }
}

export async function resolveAuthenticatedContext({ user, portal, loadMembership }) {
  if (!user?.id) throw new AuthorizationError("AUTH_REQUIRED", 401, "Debes iniciar sesión.");

  const metadataRole = user.app_metadata?.role;
  if (metadataRole === ROLES.PLATFORM_ADMIN) {
    if (portal !== "root") throw new AuthorizationError("PORTAL_FORBIDDEN", 403, "Esta cuenta solo puede acceder al Portal Root.", { userId: user.id, companyId: null, portal, role: ROLES.PLATFORM_ADMIN });
    return { userId: user.id, email: user.email || "", portal, role: ROLES.PLATFORM_ADMIN, companyId: null, enabledProducts: resolveEnabledProducts(ROLES.PLATFORM_ADMIN, null), membership: null };
  }
  // Inspector: app_metadata.role lo encierra en el portal /inspector, y desde
  // SOL-2026-11-16-003 pertenece a UNA empresa vía company_members
  // (role='inspector'), igual que administradores y operadores. Su consulta de
  // patentes y fiscalizaciones queda acotada a esa empresa (decisión P1). Sin
  // membresía activa no entra: así el administrador de la empresa lo desactiva
  // desde el Catálogo de usuarios. enabledProducts vacío: el portal
  // "inspector" no usa el gating por producto (ver canAccessPath).
  if (metadataRole === ROLES.INSPECTOR) {
    if (portal !== "inspector") throw new AuthorizationError("PORTAL_FORBIDDEN", 403, "Esta cuenta solo puede acceder al portal de Inspectores.", { userId: user.id, companyId: null, portal, role: ROLES.INSPECTOR });
    const inspectorMembership = await loadMembership(user.id);
    if (!inspectorMembership || inspectorMembership.role !== ROLES.INSPECTOR || inspectorMembership.status !== "active") {
      throw new AuthorizationError("MEMBERSHIP_INACTIVE", 403, "Tu cuenta de inspector no está activa en ninguna empresa. Contacta al administrador de tu empresa.", { userId: user.id, companyId: inspectorMembership?.company_id || null, portal, role: ROLES.INSPECTOR });
    }
    if (!inspectorMembership.company || inspectorMembership.company.status !== "active" || inspectorMembership.company.relationship_type !== "client") {
      throw new AuthorizationError("COMPANY_INACTIVE", 403, "El servicio de tu empresa está suspendido. Contacta a ParkFacil.", { userId: user.id, companyId: inspectorMembership.company_id, portal, role: ROLES.INSPECTOR });
    }
    return {
      userId: user.id,
      email: user.email || "",
      portal,
      role: ROLES.INSPECTOR,
      companyId: inspectorMembership.company_id,
      enabledProducts: [],
      membership: {
        userId: inspectorMembership.user_id,
        companyId: inspectorMembership.company_id,
        fullName: inspectorMembership.full_name,
        role: ROLES.INSPECTOR,
        status: inspectorMembership.status,
        posOnly: false,
        company: inspectorMembership.company,
      },
    };
  }

  const membership = await loadMembership(user.id);
  if (!membership || membership.status !== "active") {
    throw new AuthorizationError("MEMBERSHIP_INACTIVE", 403, "No existe una membresía cliente activa.", { userId: user.id, companyId: membership?.company_id || null, portal, role: membership?.role || null });
  }
  if (![ROLES.COMPANY_ADMIN, ROLES.OPERATOR].includes(membership.role)) {
    throw new AuthorizationError("ROLE_FORBIDDEN", 403, "El rol de la membresía no está autorizado.", { userId: user.id, companyId: membership.company_id, portal, role: membership.role });
  }
  if (!["client", "terminal"].includes(portal)) throw new AuthorizationError("PORTAL_FORBIDDEN", 403, "Esta cuenta solo puede acceder al Portal Cliente o Terminal.", { userId: user.id, companyId: membership.company_id, portal, role: membership.role });
  if (portal === "client" && (membership.role !== ROLES.COMPANY_ADMIN || membership.pos_only)) {
    throw new AuthorizationError("CLIENT_ADMIN_REQUIRED", 403, "Este acceso es exclusivo del administrador de tu empresa. Los operadores deben ingresar al POS.", { userId: user.id, companyId: membership.company_id, portal, role: membership.role });
  }
  if (portal === "terminal" && !hasPermission(membership.role, PERMISSIONS.OPERATIONS_USE)) {
    throw new AuthorizationError("PERMISSION_FORBIDDEN", 403, "Esta cuenta no tiene permiso para operar el Terminal.", { userId: user.id, companyId: membership.company_id, portal, role: membership.role });
  }
  if (!membership.company || membership.company.status !== "active" || membership.company.relationship_type !== "client") {
    const suspended = membership.company?.status === "inactive";
    throw new AuthorizationError("COMPANY_INACTIVE", 403, suspended ? "El servicio de tu empresa está suspendido. Contacta a ParkFacil." : "La empresa no está habilitada como cliente.", { userId: user.id, companyId: membership.company_id, portal, role: membership.role });
  }

  return {
    userId: user.id,
    email: user.email || "",
    portal,
    role: membership.role,
    companyId: membership.company_id,
    enabledProducts: resolveEnabledProducts(membership.role, membership.company),
    membership: {
      userId: membership.user_id,
      companyId: membership.company_id,
      fullName: membership.full_name,
      role: membership.role,
      status: membership.status,
      posOnly: Boolean(membership.pos_only),
      company: membership.company,
    },
  };
}
