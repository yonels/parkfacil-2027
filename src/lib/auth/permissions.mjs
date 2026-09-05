export const ROLES = Object.freeze({
  PLATFORM_ADMIN: "platform_admin",
  COMPANY_ADMIN: "company_admin",
  OPERATOR: "operator",
  // Inspector ParkFacil On-Street (ver Etapa 2): consulta global de patentes +
  // fiscalización, nunca administración. No es una membresía de empresa (sin
  // company_id, ver contextCore.mjs) -- exactamente por eso su consulta de
  // patentes nunca queda restringida por empresa/área/sector/calle/tramo.
  INSPECTOR: "inspector",
});

export const PERMISSIONS = Object.freeze({
  PLATFORM_GLOBAL: "platform:global",
  COMPANY_READ: "company:read",
  COMPANY_MANAGE: "company:manage",
  USERS_MANAGE: "users:manage",
  USER_CREDENTIALS_MANAGE: "users:credentials:manage",
  PARKINGS_READ: "parkings:read",
  PARKINGS_MANAGE: "parkings:manage",
  SUBSCRIBERS_READ: "subscribers:read",
  SUBSCRIBERS_MANAGE: "subscribers:manage",
  NOTIFICATIONS_READ: "notifications:read",
  COUPONS_READ: "coupons:read",
  COUPONS_MANAGE: "coupons:manage",
  OPERATIONS_USE: "operations:use",
  REPORTS_READ: "reports:read",
  BILLING_READ: "billing:read",
  BILLING_MANAGE: "billing:manage",
  BILLING_REVIEW: "billing:review",
  BILLING_APPROVE: "billing:approve",
  BILLING_ISSUE: "billing:issue",
  // ON_STREET_READ/MANAGE (piloto sin cobro, /on-street/*) se eliminaron junto
  // con el módulo piloto gratuito: era una vía de estacionamiento sin Webpay
  // que nada del producto vigente necesita. Ver §23 de la auditoría de
  // producción — remediación de bloqueante.
  // Módulo On-Street QR (producto definitivo, con Webpay): /on-street-qr/*.
  ON_STREET_QR_READ: "on_street_qr:read",
  ON_STREET_QR_MANAGE: "on_street_qr:manage",
  // Única operación del rol Inspector: consulta global de patentes On-Street
  // + registro de fiscalizaciones. Deliberadamente una sola permission (no
  // una por sub-acción): todas las operaciones del §3.2 de Etapa 2 forman un
  // mismo bloque de trabajo de terreno, ninguna tiene sentido sin las demás.
  INSPECTOR_USE: "inspector:use",
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.PLATFORM_ADMIN]: new Set(Object.values(PERMISSIONS)),
  [ROLES.COMPANY_ADMIN]: new Set([
    PERMISSIONS.COMPANY_READ,
    PERMISSIONS.COMPANY_MANAGE,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.USER_CREDENTIALS_MANAGE,
    PERMISSIONS.PARKINGS_READ,
    PERMISSIONS.PARKINGS_MANAGE,
    PERMISSIONS.SUBSCRIBERS_READ,
    PERMISSIONS.SUBSCRIBERS_MANAGE,
    PERMISSIONS.NOTIFICATIONS_READ,
    PERMISSIONS.COUPONS_READ,
    PERMISSIONS.COUPONS_MANAGE,
    PERMISSIONS.OPERATIONS_USE,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.ON_STREET_QR_READ,
    PERMISSIONS.ON_STREET_QR_MANAGE,
  ]),
  [ROLES.OPERATOR]: new Set([
    PERMISSIONS.COMPANY_READ,
    PERMISSIONS.PARKINGS_READ,
    PERMISSIONS.SUBSCRIBERS_READ,
    PERMISSIONS.NOTIFICATIONS_READ,
    PERMISSIONS.COUPONS_READ,
    PERMISSIONS.OPERATIONS_USE,
  ]),
  // Ningún permiso administrativo: ni tarifas, ni usuarios, ni
  // estacionamientos/áreas/sectores/calles, ni pagos -- exclusivamente lo que
  // requiere operar en terreno. Cualquier endpoint que ya exija un permiso
  // distinto (requirePermission) rechaza a Inspector automáticamente, sin
  // necesidad de tocar ese endpoint (ver §3.2/§25 de Etapa 2).
  [ROLES.INSPECTOR]: new Set([PERMISSIONS.INSPECTOR_USE]),
});

export function hasPermission(role, permission) {
  return ROLE_PERMISSIONS[role]?.has(permission) === true;
}

export function permissionsForRole(role) {
  return [...(ROLE_PERMISSIONS[role] || [])];
}

// Productos ParkFacil que una empresa puede tener contratados. Fuente de
// verdad: companies.enabled_products (ver migración
// 20260822090000_company_enabled_products.sql). Root no está sujeto a esta
// restricción -- administra ambos productos siempre (ver §6 de la auditoría
// "ACCESO DIFERENCIADO OFF-STREET / ON-STREET").
export const PRODUCTS = Object.freeze({
  OFF_STREET: "OFF_STREET",
  ON_STREET: "ON_STREET",
});
const ALL_PRODUCTS = Object.freeze([PRODUCTS.OFF_STREET, PRODUCTS.ON_STREET]);

// Única función que resuelve "qué productos puede usar esta sesión" -- no
// duplicar este cálculo en componentes ni rutas (ver §33/§34 de la
// auditoría): platform_admin siempre tiene ambos; company_admin/operator
// quedan limitados a lo que companies.enabled_products declare para su
// empresa (saneado contra la lista válida, nunca se confía en valores
// arbitrarios que pudieran llegar de la fila).
export function resolveEnabledProducts(role, company) {
  if (role === ROLES.PLATFORM_ADMIN) return [...ALL_PRODUCTS];
  const raw = Array.isArray(company?.enabled_products) ? company.enabled_products : [];
  return ALL_PRODUCTS.filter((product) => raw.includes(product));
}

export function hasEnabledProduct(enabledProducts, product) {
  return Array.isArray(enabledProducts) && enabledProducts.includes(product);
}

const ROOT_ONLY_PREFIXES = [
  "/empresas",
  "/contratos",
  "/facturacion",
  "/modelo-gestion-modulos",
  // Catálogo de códigos de Estacionamiento/Proyecto (corrección funcional
  // 2026-08-29): administración exclusiva de Root, ver
  // /api/administracion/codigos-estacionamiento (requirePlatformAdmin).
  "/administracion",
  // Accesos directos de creación de Área/Calle/Tramo On Street: crean
  // estructura compartida entre empresas (parking_sectors/parking_streets/
  // parking_street_segments), por lo que quedan reservados a Root, aunque
  // el resto de /on-street-qr sí sea alcanzable por company_admin.
  "/on-street-qr/areas",
  "/on-street-qr/calles",
  "/on-street-qr/tramos",
];
// "/dashboard-off-street" (Fase 3), "/reportes-off-street" (Fase 4) y
// "/recaudacion" (Fase 2, agregado en la validación Fase 5 -- §17: quedaba
// afuera de este arreglo, así que el menú SÍ le ofrecía el enlace a
// operator aunque la API igual lo rechazara con 403 por falta de
// REPORTS_READ; navegación y API deben estar alineadas): la API
// (REPORTS_READ) ya rechaza a operator/inspector con 403 -- este prefijo
// además oculta el ítem de navegación y bloquea la ruta en proxy.js
// (canAccessPath se usa en ambos) para operator, para que el menú nunca
// ofrezca un enlace que la API rechazaría. NO se le concede REPORTS_READ ni
// OPERATIONS_USE a operator; esto es únicamente visibilidad/enrutamiento, el
// permiso real no cambia.
const COMPANY_ADMIN_PREFIXES = ["/usuarios", "/on-street-qr", "/dashboard-off-street", "/reportes-off-street", "/recaudacion"];

// Prefijos de ruta que exigen un producto habilitado (Portal Cliente/
// Terminal no aplica -- Root nunca pasa por aquí, ver canAccessPath). El
// resto de /on-street-qr/* (Dashboard, Ubicaciones, Sesiones, Reportes...)
// hereda el mismo requisito que su raíz por matchesPrefix.
const PRODUCT_PREFIXES = [
  { prefix: "/estacionamientos", product: PRODUCTS.OFF_STREET },
  { prefix: "/on-street-qr", product: PRODUCTS.ON_STREET },
];

function matchesPrefix(pathname, prefixes) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function requiredProductForPath(pathname) {
  const entry = PRODUCT_PREFIXES.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return entry?.product || null;
}

export function canAccessPath({ portal, role, enabledProducts }, pathname) {
  if (portal === "terminal") {
    const terminalPath = pathname === "/pos" || pathname.startsWith("/pos/");
    return terminalPath && hasPermission(role, PERMISSIONS.OPERATIONS_USE);
  }
  // Portal Inspectores (Etapa 2): mismo patrón que Terminal -- un solo rol,
  // un solo prefijo de ruta, sin restricción por producto/empresa (consulta
  // global, ver §3.1). role===INSPECTOR nunca resuelve ningún otro portal
  // (ver contextCore.mjs), así que este chequeo por sí solo ya es
  // suficiente; hasPermission queda además como segunda comprobación
  // explícita, igual que Terminal.
  if (portal === "inspector") {
    const inspectorPath = pathname === "/inspector" || pathname.startsWith("/inspector/");
    return inspectorPath && role === ROLES.INSPECTOR && hasPermission(role, PERMISSIONS.INSPECTOR_USE);
  }
  if (role === ROLES.PLATFORM_ADMIN) {
    return portal === "root";
  }
  if (![ROLES.COMPANY_ADMIN, ROLES.OPERATOR].includes(role) || portal !== "client") {
    return false;
  }
  if (matchesPrefix(pathname, ROOT_ONLY_PREFIXES)) return false;
  if (matchesPrefix(pathname, COMPANY_ADMIN_PREFIXES) && role !== ROLES.COMPANY_ADMIN) return false;
  const requiredProduct = requiredProductForPath(pathname);
  if (requiredProduct && !hasEnabledProduct(enabledProducts, requiredProduct)) return false;
  return true;
}

export function navigationVisibleForRole(item, context) {
  // canAccessPath espera una pathname pura (igual que request.nextUrl.pathname
  // en proxy.js) -- algunos hrefs de navigationItems incluyen query string
  // (p. ej. "/estacionamientos?tipo=OFF_STREET"). Sin quitarla, requiredProductForPath
  // nunca reconoce el prefijo ("/estacionamientos?tipo=OFF_STREET" no empieza
  // con "/estacionamientos/") y el ítem queda visible sin filtrar por
  // producto -- bug detectado en la validación QA de acceso por producto.
  return Boolean(item?.href && context) && canAccessPath(context, item.href.split("#")[0].split("?")[0]);
}
