// Construye la URL del login real de operador ("Acceso Operador") en el
// Portal Cliente, a partir del host actual (Root). Es una función pura para
// poder probarla sin DOM. El ítem "Data Entry" del Portal Root SIEMPRE debe
// abrir esta pantalla en el origen del Portal Cliente (navegación completa
// entre orígenes) en vez de intentar cargar /data-entry con la sesión Root:
// las cookies de sesión y el almacenamiento de Supabase están aislados por
// origen — ver src/config/navigation.js (platformAdminGateway).

export const OPERATOR_ACCESS_PATH = "/acceso-operador";

const PRODUCTION_CLIENT_HOST = "cliente.parkfacilapp.cl";

export function buildOperatorAccessUrl(currentHost) {
  const [hostname, port] = String(currentHost || "")
    .trim()
    .toLowerCase()
    .split(":");

  const portSuffix = port ? `:${port}` : "";

  if (hostname === "root.parkfacilapp.cl" || hostname === "cliente.parkfacilapp.cl") {
    return `https://${PRODUCTION_CLIENT_HOST}${OPERATOR_ACCESS_PATH}`;
  }

  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "cliente.localhost") {
    return `http://cliente.localhost${portSuffix}${OPERATOR_ACCESS_PATH}`;
  }

  // Host desconocido (previews, otros entornos): usar el dominio de
  // producción del Portal Cliente como valor seguro por defecto.
  return `https://${PRODUCTION_CLIENT_HOST}${OPERATOR_ACCESS_PATH}`;
}

export const OPERATOR_ACCESS_FALLBACK_URL = `https://${PRODUCTION_CLIENT_HOST}${OPERATOR_ACCESS_PATH}`;
