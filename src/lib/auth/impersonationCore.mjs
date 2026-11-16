/******************************************************************
 * PARKFACIL 2027
 *---------------------------------------------------------------
 * MÓDULO    : AUTENTICACIÓN / IMPERSONACIÓN ROOT -> CLIENTE
 * ARCHIVO   : src/lib/auth/impersonationCore.mjs
 *---------------------------------------------------------------
 * DESCRIPCIÓN:
 * Lógica pura de la impersonación "Entrar como cliente". La
 * verificación de identidad REAL nunca ocurre aquí -- ocurre en
 * contextCore.mjs, re-validando el token real de Supabase en cada
 * solicitud (db.auth.getUser). Este módulo solo decide QUÉ contexto
 * construir una vez que esa identidad ya fue confirmada como
 * platform_admin, y las reglas de quién puede iniciar/mantener una
 * impersonación.
 ******************************************************************/

import { createHmac, timingSafeEqual } from "node:crypto";
import { ROLES } from "./permissions.mjs";

// Solo un platform_admin autenticado en el Portal Root puede INICIAR una
// impersonación -- nunca desde el propio Portal Cliente/Terminal/
// Inspector, y nunca un company_admin/operator (§6 del encargo: "No
// aceptar un company_id enviado por frontend sin verificar que el usuario
// es platform_admin"). Esta función no reemplaza la verificación real
// (que ocurre validando el token de Supabase server-side) -- es la regla
// de negocio que el endpoint aplica DESPUÉS de esa verificación.
export function canStartImpersonation({ realRole, realPortal }) {
  return realRole === ROLES.PLATFORM_ADMIN && realPortal === "root";
}

// Empresas impersonables: cualquier status (§7 del encargo: Root debe
// poder entrar a onboarding/inactive/active -- necesita configurarlas
// ANTES de activarlas, a diferencia de un company_admin real que exige
// status=active). Se exige relationship_type=client -- "entrar como
// cliente" no aplica a operator/administrator/partner/supplier.
export function isCompanyImpersonable(company) {
  return Boolean(company) && company.relationship_type === "client";
}

// Construye el contexto de autorización cuando Root está impersonando.
// role=company_admin (permisos plenos de administración de empresa,
// exactamente lo que pide §3: "ver y editar el 100% de la cuenta"), pero
// userId/realUserId siguen siendo la identidad REAL de Root -- nunca se
// inventa un membership.user_id distinto, así activated_by/suspended_by y
// cualquier otro campo de auditoría que use context.userId registra
// correctamente al Root real (§5: "no falsear auditoría").
export function buildImpersonatedContext({ realUserId, realEmail, portal, company }) {
  return {
    userId: realUserId,
    email: realEmail || "",
    portal,
    role: ROLES.COMPANY_ADMIN,
    companyId: company.id,
    impersonating: true,
    realRole: ROLES.PLATFORM_ADMIN,
    realUserId,
    membership: {
      userId: realUserId,
      companyId: company.id,
      fullName: "ParkFacil Root",
      role: ROLES.COMPANY_ADMIN,
      status: "active",
      posOnly: false,
      productScope: null,
      accessExpiresAt: null,
      company,
    },
  };
}

export function isImpersonating(context) {
  return Boolean(context?.impersonating);
}

/******************************************************************
 * FIRMA DE LA COOKIE DE IMPERSONACIÓN (HMAC)
 *---------------------------------------------------------------
 * Mismo patrón exacto que signWebpayQuoteEvidence/
 * verifyWebpayQuoteEvidence en src/lib/webpayQuoteEvidence.mjs
 * (createHmac sha256 + timingSafeEqual + mínimo 32 bytes de
 * secreto, falla cerrado si no está configurado) -- no se inventa
 * un esquema nuevo, se reutiliza el que ya usa el proyecto.
 *
 * La cookie NUNCA es, por sí sola, prueba de identidad -- solo dice
 * "un platform_admin autenticado como <rootUserId> autorizó esto
 * para <companyId> en <issuedAt>". El límite de seguridad real
 * sigue siendo la re-verificación del token real de Supabase en
 * cada solicitud (ver authenticatedContext.js): la firma solo
 * asegura que, DADO que el token ya probó quién es el usuario real,
 * la cookie que dice qué empresa impersonar no fue manipulada.
 *
 * La firma incluye rootUserId (no solo companyId): una cookie
 * firmada para el Root A nunca es válida bajo el token del Root B,
 * aunque ambos sean platform_admin -- defensa adicional, no exigida
 * explícitamente pero gratis dado el diseño.
 ******************************************************************/

const IMPERSONATION_COOKIE_MAX_AGE_MS = 55 * 60 * 1000; // igual a SESSION_COOKIE

function requireSecret(secret) {
  if (Buffer.byteLength(String(secret || ""), "utf8") < 32) {
    throw new Error("IMPERSONATION_HMAC_SECRET_NOT_CONFIGURED");
  }
}

function computeImpersonationSignature({ secret, rootUserId, companyId, issuedAt }) {
  requireSecret(secret);
  return createHmac("sha256", secret)
    .update(`${rootUserId}:${companyId}:${issuedAt}`, "utf8")
    .digest("hex");
}

// Construye el valor completo de la cookie: "companyId.issuedAt.firma".
export function signImpersonationCookie({ secret, rootUserId, companyId, issuedAt = Date.now() }) {
  const signature = computeImpersonationSignature({ secret, rootUserId, companyId, issuedAt });
  return `${companyId}.${issuedAt}.${signature}`;
}

// Verifica una cookie recibida. `rootUserId` SIEMPRE debe venir de la
// identidad ya confirmada por el token real de Supabase de ESTA
// solicitud -- nunca de la propia cookie ni de ningún dato enviado por
// el cliente. Devuelve { ok:false, reason } o { ok:true, companyId,
// issuedAt }; nunca lanza por una cookie inválida/manipulada (solo por
// falta de configuración del secreto, ver requireSecret).
export function verifyImpersonationCookie({ secret, rootUserId, cookieValue, now = Date.now(), maxAgeMs = IMPERSONATION_COOKIE_MAX_AGE_MS }) {
  requireSecret(secret);
  if (!rootUserId || !cookieValue) return { ok: false, reason: "MISSING_INPUT" };

  const parts = String(cookieValue).split(".");
  if (parts.length !== 3) return { ok: false, reason: "MALFORMED" };
  const [companyId, issuedAtRaw, signature] = parts;
  const issuedAt = Number(issuedAtRaw);
  if (!companyId || !Number.isFinite(issuedAt) || !/^[0-9a-f]{64}$/i.test(signature)) {
    return { ok: false, reason: "MALFORMED" };
  }

  const expected = computeImpersonationSignature({ secret, rootUserId, companyId, issuedAt });
  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(signature, "hex");
  // Buffers de igual longitud siempre (ambos son hex de sha256, 64
  // caracteres, ya validado arriba por la regex) -- timingSafeEqual
  // exige longitudes iguales o lanza, por eso la regex previa.
  if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
    return { ok: false, reason: "SIGNATURE_MISMATCH" };
  }

  // Expiración propia de la cookie (independiente del maxAge del
  // navegador, que igual se configura al mismo valor) -- y guarda contra
  // un issuedAt en el futuro (reloj manipulado / cookie reconstruida).
  if (now < issuedAt || now - issuedAt > maxAgeMs) {
    return { ok: false, reason: "EXPIRED" };
  }

  return { ok: true, companyId, issuedAt };
}

/******************************************************************
 * URLs de navegación cruzada entre orígenes (Root <-> Cliente).
 *---------------------------------------------------------------
 * Mismo patrón exacto que buildOperatorAccessUrl en
 * operatorAccessUrl.mjs: cada subdominio es un origen aislado (sin
 * cookies compartidas, ver esa misma nota), así que entrar/salir de
 * la impersonación es siempre una navegación de página completa, no
 * un fetch same-origin.
 ******************************************************************/

const PRODUCTION_ROOT_HOST = "root.parkfacilapp.cl";
const PRODUCTION_CLIENT_HOST = "cliente.parkfacilapp.cl";
export const IMPERSONATION_HANDOFF_PATH = "/impersonar";

function splitHost(currentHost) {
  const [hostname, port] = String(currentHost || "").trim().toLowerCase().split(":");
  return { hostname, portSuffix: port ? `:${port}` : "" };
}

// El access_token real de Root viaja en el FRAGMENTO (#) de la URL, nunca
// en el path ni en query string -- el navegador no lo envía al servidor
// (ni en la solicitud de página, ni en el header Referer de la siguiente
// navegación), y la página de destino (/impersonar) lo limpia de la URL
// apenas lo lee (ver src/app/impersonar/page.js).
export function buildImpersonationHandoffUrl({ currentHost, companyId, accessToken }) {
  const { hostname, portSuffix } = splitHost(currentHost);
  const fragment = `access_token=${encodeURIComponent(accessToken)}&company_id=${encodeURIComponent(companyId)}`;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "root.localhost" || hostname === "cliente.localhost") {
    return `http://cliente.localhost${portSuffix}${IMPERSONATION_HANDOFF_PATH}#${fragment}`;
  }
  return `https://${PRODUCTION_CLIENT_HOST}${IMPERSONATION_HANDOFF_PATH}#${fragment}`;
}

export function buildRootReturnUrl(currentHost) {
  const { hostname, portSuffix } = splitHost(currentHost);
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "root.localhost" || hostname === "cliente.localhost") {
    return `http://root.localhost${portSuffix}/empresas`;
  }
  return `https://${PRODUCTION_ROOT_HOST}/empresas`;
}
