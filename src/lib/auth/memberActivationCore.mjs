/******************************************************************
 * PARKFACIL 2027
 *---------------------------------------------------------------
 * MÓDULO    : AUTENTICACIÓN / MODELO DE USUARIOS POR EMPRESA
 * ARCHIVO   : src/lib/auth/memberActivationCore.mjs
 *---------------------------------------------------------------
 * DESCRIPCIÓN:
 * Lógica pura (sin dependencias de framework/BD) del modelo de
 * activación de company_members controlado por Root:
 *  - product_scope: alcance operativo del usuario dentro de su
 *    empresa (distinto de companies.enabled_products).
 *  - activación indefinida / temporal con vencimiento.
 *  - auditoría (quién/cuándo activó o suspendió).
 *
 * Se probea exhaustivamente en memberActivationCore.test.mjs
 * (ver FASE 14 del encargo "modelo de usuarios base por empresa").
 ******************************************************************/

export const PRODUCT_SCOPES = Object.freeze({
  OFF_STREET: "OFF_STREET",
  ON_STREET: "ON_STREET",
  BOTH: "BOTH",
});

const VALID_PRODUCT_SCOPES = new Set(Object.values(PRODUCT_SCOPES));
const VALID_PRODUCTS = new Set(["OFF_STREET", "ON_STREET"]);

// Presets de duración de acceso temporal (FASE 4-B).
export const ACCESS_DURATION_PRESET_HOURS = Object.freeze([1, 2, 4, 8, 12, 24]);

/******************************************************************
 * PRODUCT_SCOPE -- alcance operativo del usuario
 ******************************************************************/

// Restringe los productos habilitados de la EMPRESA (companies.enabled_products)
// por el alcance del MIEMBRO (company_members.product_scope). Nunca amplía
// lo que la empresa tiene contratado -- solo puede reducirlo.
//
// Compatibilidad con registros existentes (§5 del encargo, ya verificado
// contra los 10 company_members reales antes de escribir esta función):
//  - product_scope NULL o "BOTH": sin restricción adicional -- el usuario
//    hereda TODOS los productos de su empresa. Este es el comportamiento
//    que TODOS los usuarios (company_admin y operator) tenían antes de que
//    existiera este campo, así que NULL se trata igual que "BOTH" para no
//    quitarle a nadie un acceso que ya tenía legítimamente.
//  - product_scope OFF_STREET/ON_STREET: el usuario queda limitado a ese
//    único producto, aunque su empresa tenga ambos habilitados.
export function applyProductScope(companyEnabledProducts, productScope) {
  const base = Array.isArray(companyEnabledProducts) ? companyEnabledProducts : [];
  if (!productScope || productScope === PRODUCT_SCOPES.BOTH) {
    return [...base];
  }
  return base.filter((product) => product === productScope);
}

// Alcance por defecto al CREAR un usuario cuando no se indica explícitamente
// (§1/§9 del encargo). company_admin: BOTH si la empresa tiene ambos
// productos, o el único que tenga si solo tiene uno, o null si no tiene
// ninguno todavía. operator: nunca se infiere -- debe ser explícito (ver
// validateProductScopeForCreation), porque no hay un "caso funcional
// justificado" documentado para asumir BOTH en un operador nuevo.
export function resolveDefaultProductScope({ role, companyEnabledProducts }) {
  const enabled = Array.isArray(companyEnabledProducts) ? companyEnabledProducts : [];
  if (role === "company_admin") {
    if (enabled.includes("OFF_STREET") && enabled.includes("ON_STREET")) return PRODUCT_SCOPES.BOTH;
    if (enabled.includes("OFF_STREET")) return PRODUCT_SCOPES.OFF_STREET;
    if (enabled.includes("ON_STREET")) return PRODUCT_SCOPES.ON_STREET;
    return null;
  }
  return null;
}

// Valida el product_scope solicitado al crear/editar un usuario.
//  - Debe ser uno de los valores válidos del CHECK constraint (o vacío).
//  - Nunca puede exceder companies.enabled_products (no se puede asignar
//    OFF_STREET a un usuario de una empresa que no tiene ese producto).
//  - operator: BOTH está deliberadamente prohibido salvo que se indique
//    allowOperatorBoth=true (§9 del encargo: "no conviertas automáticamente
//    todos los operator en BOTH" -- la preferencia actual es un producto
//    único por operador; se deja la puerta abierta para un caso futuro
//    justificado, pero no como comportamiento por defecto).
export function validateProductScopeForCreation({
  role,
  productScope,
  companyEnabledProducts,
  allowOperatorBoth = false,
}) {
  const enabled = Array.isArray(companyEnabledProducts) ? companyEnabledProducts : [];
  const resolved = productScope || resolveDefaultProductScope({ role, companyEnabledProducts: enabled });

  if (role === "operator" && !resolved) {
    return { ok: false, error: "Selecciona el producto (Off Street u On Street) para este operador.", value: null };
  }

  if (!resolved) {
    // company_admin de una empresa aún sin productos habilitados: se
    // permite crear sin product_scope (queda NULL, sin restricción --
    // ver applyProductScope), no es un error.
    return { ok: true, error: null, value: null };
  }

  if (!VALID_PRODUCT_SCOPES.has(resolved)) {
    return { ok: false, error: "El alcance de producto indicado no es válido.", value: null };
  }

  if (role === "operator" && resolved === PRODUCT_SCOPES.BOTH && !allowOperatorBoth) {
    return { ok: false, error: "Un operador debe tener un único producto (Off Street u On Street), no ambos.", value: null };
  }

  if (resolved !== PRODUCT_SCOPES.BOTH && !enabled.includes(resolved)) {
    return { ok: false, error: "La empresa no tiene ese producto habilitado.", value: null };
  }

  if (resolved === PRODUCT_SCOPES.BOTH && (!enabled.includes("OFF_STREET") || !enabled.includes("ON_STREET"))) {
    return { ok: false, error: "La empresa no tiene ambos productos habilitados.", value: null };
  }

  return { ok: true, error: null, value: resolved };
}

// Etiqueta amigable para la columna "Función" del grid de Root (FASE 7/8):
// Administrador / Operador Off Street / Inspector On Street -- aunque
// técnicamente ambos últimos sean role=operator (§ el encargo es explícito:
// NO existe un rol "inspector" separado en company_members).
export function functionLabel({ role, productScope }) {
  if (role === "company_admin") return "Administrador";
  if (role !== "operator") return role || "Sin definir";
  if (productScope === PRODUCT_SCOPES.ON_STREET) return "Inspector On Street";
  if (productScope === PRODUCT_SCOPES.OFF_STREET) return "Operador Off Street";
  if (productScope === PRODUCT_SCOPES.BOTH) return "Operador (Off Street + On Street)";
  return "Operador";
}

/******************************************************************
 * ACTIVACIÓN / EXPIRACIÓN (FASE 4-5)
 ******************************************************************/

// company.status==='active' AND member.status==='active' AND
// (access_expires_at IS NULL OR access_expires_at > now()) -- ver FASE 6
// del encargo, regla exacta pedida.
export function isMembershipWithinAccessWindow({ status, accessExpiresAt, now = new Date() }) {
  if (status !== "active") return false;
  if (!accessExpiresAt) return true;
  const expires = accessExpiresAt instanceof Date ? accessExpiresAt : new Date(accessExpiresAt);
  if (Number.isNaN(expires.getTime())) return true; // valor corrupto: fail-open a "sin vencimiento" antes que negar acceso por un dato ilegible -- pero esto no debería ocurrir nunca vía los endpoints controlados.
  return expires.getTime() > now.getTime();
}

export function isCompanyOperational(companyStatus) {
  return companyStatus === "active";
}

// Autorización combinada empresa + miembro + vencimiento -- punto único
// reutilizado tanto por contextCore.mjs (sesión completa) como por
// verificaciones puntuales. Nunca "basta con ocultar en frontend": esto es
// lo que corre server-side en cada solicitud.
export function isMemberAuthorizedToOperate({ companyStatus, memberStatus, accessExpiresAt, now = new Date() }) {
  return isCompanyOperational(companyStatus) && isMembershipWithinAccessWindow({ status: memberStatus, accessExpiresAt, now });
}

// Estado visible para UI (FASE 5): ACTIVO / ACTIVO HASTA fecha / SUSPENDIDO
// / PENDIENTE / VENCIDO. "Vencido" es puramente calculado -- en BD el
// status sigue siendo "active" con access_expires_at en el pasado, tal
// como pediste (no se crea un status "expired" nuevo).
export function resolveDisplayStatus({ status, accessExpiresAt, now = new Date() }) {
  if (status === "invited") return "pending";
  if (status === "suspended") return "suspended";
  if (status === "inactive") return "inactive";
  if (status === "active") {
    if (!accessExpiresAt) return "active_indefinite";
    const expires = new Date(accessExpiresAt);
    if (!Number.isNaN(expires.getTime()) && expires.getTime() <= now.getTime()) return "expired";
    return "active_until";
  }
  return "unknown";
}

export const DISPLAY_STATUS_LABELS = Object.freeze({
  active_indefinite: "Activo",
  active_until: "Activo hasta",
  suspended: "Suspendido",
  pending: "Pendiente",
  expired: "Vencido",
  inactive: "Inactivo",
  unknown: "Desconocido",
});

// Calcula access_expires_at para una activación temporal. mode:
// "preset" (horas exactas de ACCESS_DURATION_PRESET_HOURS) o "custom"
// (fecha/hora ISO ya elegida por Root en el formulario).
export function computeAccessExpiresAt({ mode, hours, customIso, now = new Date() }) {
  if (mode === "preset") {
    const value = Number(hours);
    if (!ACCESS_DURATION_PRESET_HOURS.includes(value)) {
      return { ok: false, error: "La duración indicada no es una de las opciones permitidas.", value: null };
    }
    return { ok: true, error: null, value: new Date(now.getTime() + value * 60 * 60 * 1000).toISOString() };
  }
  if (mode === "custom") {
    const parsed = new Date(customIso);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "La fecha/hora de vencimiento no es válida.", value: null };
    }
    if (parsed.getTime() <= now.getTime()) {
      return { ok: false, error: "La fecha/hora de vencimiento debe ser futura.", value: null };
    }
    return { ok: true, error: null, value: parsed.toISOString() };
  }
  return { ok: false, error: "Modo de activación temporal no reconocido.", value: null };
}

/******************************************************************
 * ACCIONES DE ROOT (FASE 4/7) -- únicas mutaciones permitidas sobre
 * status, access_expires_at y los campos de auditoría de activación
 * y suspensión (§3 del encargo: jamás libremente enviadas por Cliente).
 ******************************************************************/

export const ACTIVATION_ACTIONS = Object.freeze({
  ACTIVATE_INDEFINITE: "activar_indefinido",
  ACTIVATE_TEMPORARY: "activar_temporal",
  SUSPEND: "suspender",
  REACTIVATE: "reactivar",
  // "Eliminar" (§ el encargo, "eliminar company_admin"): no existe hoy un
  // borrado físico de company_members en todo el proyecto (confirmado en
  // el diagnóstico -- el botón "Eliminar" del grid era solo estado local,
  // nunca llamaba a ninguna API). Se implementa como baja lógica --
  // status="inactive" (el 4to valor real del CHECK, distinto de
  // "suspended") -- preserva historial/auditoría y es reversible por
  // Root, en vez de un DELETE físico irreversible que además dejaría
  // huérfanas company_member_parkings y el historial de activated_by/
  // suspended_by.
  DEACTIVATE: "eliminar",
});

// Construye el UPDATE exacto para company_members dada una acción de Root.
// Pura: no toca la BD, solo calcula qué escribir y valida la acción.
// actorUserId: SIEMPRE un platform_admin autenticado (lo exige el
// endpoint vía requirePlatformAdmin antes de llamar aquí) -- nunca el
// propio usuario ni su company_admin (§8, regla 3: "Cliente no puede
// activar su propio usuario").
export function buildActivationUpdate({ action, hours, customExpiresAt, actorUserId, currentStatus, now = new Date() }) {
  if (!actorUserId) {
    return { ok: false, error: "Se requiere un platform_admin autenticado para esta acción.", update: null };
  }

  const nowIso = now.toISOString();

  if (action === ACTIVATION_ACTIONS.ACTIVATE_INDEFINITE) {
    return {
      ok: true,
      error: null,
      update: {
        status: "active",
        access_expires_at: null,
        activated_at: nowIso,
        activated_by: actorUserId,
        suspended_at: null,
        suspended_by: null,
      },
    };
  }

  if (action === ACTIVATION_ACTIONS.ACTIVATE_TEMPORARY) {
    const expires = hours !== undefined && hours !== null
      ? computeAccessExpiresAt({ mode: "preset", hours, now })
      : computeAccessExpiresAt({ mode: "custom", customIso: customExpiresAt, now });
    if (!expires.ok) return { ok: false, error: expires.error, update: null };
    return {
      ok: true,
      error: null,
      update: {
        status: "active",
        access_expires_at: expires.value,
        activated_at: nowIso,
        activated_by: actorUserId,
        suspended_at: null,
        suspended_by: null,
      },
    };
  }

  if (action === ACTIVATION_ACTIONS.SUSPEND) {
    return {
      ok: true,
      error: null,
      update: {
        status: "suspended",
        suspended_at: nowIso,
        suspended_by: actorUserId,
      },
    };
  }

  if (action === ACTIVATION_ACTIONS.DEACTIVATE) {
    return {
      ok: true,
      error: null,
      update: {
        status: "inactive",
        access_expires_at: null,
        suspended_at: nowIso,
        suspended_by: actorUserId,
      },
    };
  }

  if (action === ACTIVATION_ACTIONS.REACTIVATE) {
    if (currentStatus !== "suspended") {
      return { ok: false, error: "Solo se puede reactivar un usuario que esté suspendido.", update: null };
    }
    return {
      ok: true,
      error: null,
      update: {
        status: "active",
        access_expires_at: null,
        activated_at: nowIso,
        activated_by: actorUserId,
        suspended_at: null,
        suspended_by: null,
      },
    };
  }

  return { ok: false, error: "Acción de activación no reconocida.", update: null };
}

// Regla §8.7: el Cliente (company_admin) no puede activar su propio
// usuario. El endpoint de activación es Root-only en su totalidad (ver
// requirePlatformAdmin en el route.js), así que esta función es una
// segunda barrera explícita y auditable, no la única.
export function actorCanActivate({ actorRole, actorPortal }) {
  return actorRole === "platform_admin" && actorPortal === "root";
}

export function isValidProduct(product) {
  return VALID_PRODUCTS.has(product);
}

/******************************************************************
 * PROTECCIÓN DEL ÚLTIMO ADMINISTRADOR
 *---------------------------------------------------------------
 * Precedente analizado y adaptado (NO copiado literal) de
 * parkfacil-v2: src/lib/authz/permissions.mjs
 * (quedaAlMenosUnAdministrador/esAdministradorFuncional) +
 * src/app/api/administracion/usuarios/route.js
 * (protegerUltimoAdministrador). Allá "administrador funcional" se
 * decide por PERMISOS efectivos (una matriz editable en BD); acá el
 * modelo real de parkfacil-2027 no tiene esa matriz -- el rol
 * company_admin ES la única jerarquía administrativa de una empresa
 * cliente (ver ROLES/ROLE_PERMISSIONS en permissions.mjs), así que
 * "administrador válido" se define directamente por rol + status,
 * sin necesitar una capa de permisos configurable.
 ******************************************************************/

// "Administrador válido" (§ el encargo): role=company_admin y NO estar en
// un estado equivalente a eliminado/suspendido/inválido -- en el modelo
// real de company_members eso es exactamente status==='active' (los otros
// 3 valores del CHECK -- invited/suspended/inactive -- son todos estados
// en los que el usuario no puede operar, ver isMembershipWithinAccessWindow).
export function isValidCompanyAdmin(member) {
  return member?.role === "company_admin" && member?.status === "active";
}

// Mismo patrón que quedaAlMenosUnAdministrador de parkfacil-v2: se arma el
// conjunto RESULTANTE (los demás miembros de la empresa, tal como quedan
// hoy, más el estado PROPUESTO del miembro que se está modificando) y se
// verifica que siga habiendo al menos un administrador válido en ese
// conjunto. Puramente funcional -- no toca la BD, el caller (el endpoint)
// es quien trae otherMembers ya filtrado por company_id != el propio caso.
//
// Permite explícitamente el flujo de reemplazo que pide el encargo: crear
// un segundo admin, activarlo (queda "active" en otherMembers), y RECIÉN
// ENTONCES suspender/eliminar/cambiar de rol al primero -- en ese momento
// otherMembers ya incluye al segundo admin válido, así que la operación se
// permite.
export function wouldRemoveLastCompanyAdmin({ otherMembers, proposedMember }) {
  const resultante = [...(Array.isArray(otherMembers) ? otherMembers : []), proposedMember];
  return !resultante.some((member) => isValidCompanyAdmin(member));
}

// Valida una operación sobre un company_members existente ANTES de
// aplicarla. `targetMember` es el estado ACTUAL de la fila (antes del
// cambio); `changes` son los campos que se le aplicarían (p.ej.
// {status:"suspended"} o {role:"operator"}). Si el miembro objetivo no es
// hoy un administrador válido, la operación es irrelevante para esta
// regla (nunca bloquea a quien no era admin protegido). Root NO tiene
// excepción por defecto (§ el encargo: "incluso Root no debería dejar
// accidentalmente una empresa sin administrador") -- ver
// LAST_ADMIN_ERROR_CODE/LAST_ADMIN_ERROR_MESSAGE, que el endpoint debe
// traducir a un 409.
export const LAST_ADMIN_ERROR_CODE = "LAST_ADMIN_PROTECTED";
export const LAST_ADMIN_ERROR_MESSAGE =
  "No puedes completar esta acción: la empresa quedaría sin ningún administrador activo. Crea o activa otro administrador antes de continuar.";

export function guardLastCompanyAdmin({ targetMember, changes, otherMembers }) {
  if (!isValidCompanyAdmin(targetMember)) {
    // El miembro objetivo no era un administrador válido hoy (ya era
    // operator, o ya estaba suspendido/invitado/inactivo) -- esta
    // operación no puede ser la que "deja a la empresa sin admin", así
    // que no hay nada que proteger aquí.
    return { ok: true, error: null };
  }
  const proposedMember = { ...targetMember, ...changes };
  if (wouldRemoveLastCompanyAdmin({ otherMembers, proposedMember })) {
    return { ok: false, error: LAST_ADMIN_ERROR_MESSAGE, code: LAST_ADMIN_ERROR_CODE };
  }
  return { ok: true, error: null };
}
