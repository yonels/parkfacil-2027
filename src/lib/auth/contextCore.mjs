import { ROLES } from "./permissions.mjs";

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
    return { userId: user.id, email: user.email || "", portal, role: ROLES.PLATFORM_ADMIN, companyId: null, membership: null };
  }

  const membership = await loadMembership(user.id);
  if (!membership || membership.status !== "active") {
    throw new AuthorizationError("MEMBERSHIP_INACTIVE", 403, "No existe una membresía cliente activa.", { userId: user.id, companyId: membership?.company_id || null, portal, role: membership?.role || null });
  }
  if (![ROLES.COMPANY_ADMIN, ROLES.OPERATOR].includes(membership.role)) {
    throw new AuthorizationError("ROLE_FORBIDDEN", 403, "El rol de la membresía no está autorizado.", { userId: user.id, companyId: membership.company_id, portal, role: membership.role });
  }
  if (portal !== "client") throw new AuthorizationError("PORTAL_FORBIDDEN", 403, "Esta cuenta solo puede acceder al Portal Cliente.", { userId: user.id, companyId: membership.company_id, portal, role: membership.role });
  if (!membership.company || membership.company.status !== "active" || membership.company.relationship_type !== "client") {
    throw new AuthorizationError("COMPANY_INACTIVE", 403, "La empresa no está habilitada como cliente.", { userId: user.id, companyId: membership.company_id, portal, role: membership.role });
  }

  return {
    userId: user.id,
    email: user.email || "",
    portal,
    role: membership.role,
    companyId: membership.company_id,
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
