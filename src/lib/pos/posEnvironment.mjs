// Ambiente del POS (SOL-2026-11-12-005). En el PRO2 de desarrollo se confundió el POS de
// producción con el de pruebas: ambos decían «Terminal operativo». Fuera de producción el POS
// muestra una franja fija con este texto. Puro: lo usan el componente y las pruebas.

export const POS_TEST_ENVIRONMENT_LABEL = "AMBIENTE DE PRUEBAS (QA) — sin dinero real";

// Producción = el dominio propio parkfacilapp.cl y sus subdominios (cliente, pos, acceso,
// root, onstreet, www). Todo lo demás es prueba: Preview de Vercel (*.vercel.app, que es QA),
// localhost y cualquier otro host. Un subdominio con marca de prueba (qa., dev., staging.,
// test., preview.) se trata como prueba aunque cuelgue de parkfacilapp.cl.
const PRODUCTION_DOMAIN = "parkfacilapp.cl";
const TEST_LABEL = /(^|[.-])(qa|dev|staging|test|preview)([.-]|$)/;

export function isProductionPosHost(hostname) {
  const host = String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  if (host !== PRODUCTION_DOMAIN && !host.endsWith(`.${PRODUCTION_DOMAIN}`)) return false;
  const subdomain = host === PRODUCTION_DOMAIN ? "" : host.slice(0, -(PRODUCTION_DOMAIN.length + 1));
  return !TEST_LABEL.test(subdomain);
}

export function posTestEnvironmentLabel(hostname) {
  return isProductionPosHost(hostname) ? null : POS_TEST_ENVIRONMENT_LABEL;
}
