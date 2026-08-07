// Destino seguro post-login: evita que un `next` externo o mal formado saque al
// usuario del sitio. Extraida como funcion pura para poder probarla sin depender
// de next/navigation ni renderizar el formulario de login.
export function getSafeDestination(value) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}
