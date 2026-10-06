// Destino seguro post-login: evita que un `next` externo o mal formado saque al
// usuario del sitio. Extraida como funcion pura para poder probarla sin depender
// de next/navigation ni renderizar el formulario de login.
export function getSafeDestination(value) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function getProductLoginDestination({ portal, destination, enabledProducts = [], role }) {
  if (portal !== "cliente" || destination !== "/" || enabledProducts.length !== 1) return destination;
  if (enabledProducts[0] === "ON_STREET") return "/on-street-qr";
  if (enabledProducts[0] === "OFF_STREET") return role === "company_admin" ? "/dashboard-off-street" : "/estacionamientos";
  return destination;
}
