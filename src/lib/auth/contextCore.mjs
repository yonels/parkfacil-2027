import { hasPermission, PERMISSIONS, resolveEnabledProducts, ROLES } from "./permissions.mjs";
import { applyProductScope, isMembershipWithinAccessWindow } from "./memberActivationCore.mjs";
import { buildImpersonatedContext, isCompanyImpersonable } from "./impersonationCore.mjs";
import { usuarioAuthHabilitado } from "../passwordRecoveryCore.mjs";

export class AuthorizationError extends Error {
  constructor(code, status, message, auditContext = null) {
    super(message);
    this.name = "AuthorizationError";
    this.code = code;
    this.status = status;
    this.auditContext = auditContext;
  }
}

export async function resolveAuthenticatedContext({ user, portal, loadMembership, impersonatedCompanyId = null, loadCompany }) {
  if (!user?.id) throw new AuthorizationError("AUTH_REQUIRED", 401, "Debes iniciar sesión.");

  // Cuenta deshabilitada en Supabase Auth (banned_until/deleted_at) --
  // §2/§6 del encargo "usuario deshabilitado". El token de acceso ya
  // emitido ANTES de deshabilitar a alguien sigue siendo criptográficamente
  // válido hasta su propio vencimiento (característica normal de un JWT
  // stateless, Supabase no lo revoca retroactivamente) -- sin este chequeo,
  // esa cuenta podía seguir operando hasta ~55 minutos después de que Root
  // la deshabilitara. Se verifica en CADA solicitud (no solo al iniciar
  // sesión), reutilizando exactamente la misma regla que ya usa
  // passwordRecoveryCore.mjs (usuarioAuthHabilitado) para no duplicar el
  // criterio de "cuenta habilitada" en dos lugares distintos.
  if (!usuarioAuthHabilitado(user)) {
    throw new AuthorizationError("AUTH_REQUIRED", 401, "La sesión no es válida.", { userId: user.id, companyId: null, portal, role: null });
  }

  const metadataRole = user.app_metadata?.role;
  if (metadataRole === ROLES.PLATFORM_ADMIN) {
    // Impersonación "Entrar como cliente" (§ modelo de impersonación
    // Root -> Cliente): SOLO alcanzable dentro de esta rama, es decir,
    // solo cuando la identidad REAL (ya verificada por el caller vía el
    // token de Supabase, ver authenticatedContext.js) es platform_admin.
    // Un company_admin/operator real (metadataRole distinto) nunca puede
    // llegar aquí sin importar qué cookie de impersonación envíe -- no
    // hay ninguna rama alternativa que la lea.
    if (impersonatedCompanyId) {
      if (portal !== "client") {
        throw new AuthorizationError("PORTAL_FORBIDDEN", 403, "La impersonación solo es válida en el Portal Cliente.", { userId: user.id, companyId: impersonatedCompanyId, portal, role: ROLES.PLATFORM_ADMIN });
      }
      const company = await loadCompany(impersonatedCompanyId);
      if (!isCompanyImpersonable(company)) {
        throw new AuthorizationError("COMPANY_NOT_IMPERSONABLE", 403, "No se encontró la empresa a impersonar, o no es una empresa cliente.", { userId: user.id, companyId: impersonatedCompanyId, portal, role: ROLES.PLATFORM_ADMIN });
      }
      const impersonatedContext = buildImpersonatedContext({ realUserId: user.id, realEmail: user.email, portal, company });
      return { ...impersonatedContext, enabledProducts: resolveEnabledProducts(ROLES.COMPANY_ADMIN, company) };
    }
    if (portal !== "root") throw new AuthorizationError("PORTAL_FORBIDDEN", 403, "Esta cuenta solo puede acceder al Portal Root.", { userId: user.id, companyId: null, portal, role: ROLES.PLATFORM_ADMIN });
    return { userId: user.id, email: user.email || "", portal, role: ROLES.PLATFORM_ADMIN, companyId: null, enabledProducts: resolveEnabledProducts(ROLES.PLATFORM_ADMIN, null), membership: null, impersonating: false };
  }
  // Inspector (Etapa 2): igual que platform_admin, resuelto por
  // app_metadata.role -- deliberadamente SIN loadMembership/company_id, para
  // que la consulta de patentes nunca quede restringida por empresa (ver
  // §3.1 de Etapa 2). enabledProducts vacío: Inspector no usa el gating por
  // producto Off/On Street, portal "inspector" no lo evalúa (ver canAccessPath).
  if (metadataRole === ROLES.INSPECTOR) {
    if (portal !== "inspector") throw new AuthorizationError("PORTAL_FORBIDDEN", 403, "Esta cuenta solo puede acceder al portal de Inspectores.", { userId: user.id, companyId: null, portal, role: ROLES.INSPECTOR });
    return { userId: user.id, email: user.email || "", portal, role: ROLES.INSPECTOR, companyId: null, enabledProducts: [], membership: null };
  }

  const membership = await loadMembership(user.id);
  if (!membership || membership.status !== "active") {
    throw new AuthorizationError("MEMBERSHIP_INACTIVE", 403, "No existe una membresía cliente activa.", { userId: user.id, companyId: membership?.company_id || null, portal, role: membership?.role || null });
  }
  // Acceso temporal vencido (§ FASE 4-6 "modelo de usuarios por empresa"):
  // la fila sigue con status="active" en BD (no existe un status "expired"
  // propio, ver isMembershipWithinAccessWindow/resolveDisplayStatus en
  // memberActivationCore.mjs) -- la validación es exclusivamente
  // server-side, aquí, no basta con ocultarlo en el frontend.
  if (!isMembershipWithinAccessWindow({ status: membership.status, accessExpiresAt: membership.access_expires_at })) {
    throw new AuthorizationError("ACCESS_EXPIRED", 403, "El acceso de esta cuenta venció.", { userId: user.id, companyId: membership.company_id, portal, role: membership.role });
  }
  if (![ROLES.COMPANY_ADMIN, ROLES.OPERATOR].includes(membership.role)) {
    throw new AuthorizationError("ROLE_FORBIDDEN", 403, "El rol de la membresía no está autorizado.", { userId: user.id, companyId: membership.company_id, portal, role: membership.role });
  }
  if (!["client", "terminal"].includes(portal)) throw new AuthorizationError("PORTAL_FORBIDDEN", 403, "Esta cuenta solo puede acceder al Portal Cliente o Terminal.", { userId: user.id, companyId: membership.company_id, portal, role: membership.role });
  if (portal === "terminal" && !hasPermission(membership.role, PERMISSIONS.OPERATIONS_USE)) {
    throw new AuthorizationError("PERMISSION_FORBIDDEN", 403, "Esta cuenta no tiene permiso para operar el Terminal.", { userId: user.id, companyId: membership.company_id, portal, role: membership.role });
  }
  if (!membership.company || membership.company.status !== "active" || membership.company.relationship_type !== "client") {
    throw new AuthorizationError("COMPANY_INACTIVE", 403, "La empresa no está habilitada como cliente.", { userId: user.id, companyId: membership.company_id, portal, role: membership.role });
  }

  return {
    userId: user.id,
    email: user.email || "",
    portal,
    role: membership.role,
    companyId: membership.company_id,
    // Restringido primero por lo que la empresa contrató
    // (resolveEnabledProducts) y luego por el alcance operativo propio
    // del usuario (applyProductScope/company_members.product_scope) --
    // nunca al revés, nunca puede ampliar lo que la empresa habilitó.
    enabledProducts: applyProductScope(resolveEnabledProducts(membership.role, membership.company), membership.product_scope),
    membership: {
      userId: membership.user_id,
      companyId: membership.company_id,
      fullName: membership.full_name,
      role: membership.role,
      status: membership.status,
      posOnly: Boolean(membership.pos_only),
      productScope: membership.product_scope ?? null,
      accessExpiresAt: membership.access_expires_at ?? null,
      company: membership.company,
    },
  };
}
