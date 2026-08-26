// Lógica pura de matching para el árbol de navegación del Sidebar/
// MobileNavigation (Portal Root/Cliente). Sin dependencias de React ni de
// Next.js — testeable directamente con `node --test`. Sidebar.js y
// MobileNavigation.js importan estas mismas funciones; no hay una segunda
// copia de la lógica.

// Un padre puede necesitar permanecer activo/expandido bajo más de un
// prefijo de ruta (p. ej. "Estacionamientos" agrupa tanto /estacionamientos
// como /on-street-qr, dos apps distintas consolidadas bajo un mismo nodo).
// Acepta un string o un arreglo de strings.
export function matchesActivePrefix(pathname, prefix) {
  if (typeof pathname !== "string" || !prefix) return false;
  const prefixes = Array.isArray(prefix) ? prefix : [prefix];
  return prefixes.some((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
}

export function isItemActive(pathname, href) {
  if (typeof pathname !== "string" || !href) return false;
  const [withoutHash] = href.split("#");
  const [baseHref, expectedQuery = ""] = withoutHash.split("?");
  return pathname === baseHref && !expectedQuery;
}

// Recursivo: un nodo (o cualquiera de sus hijos, a cualquier profundidad)
// puede marcar a toda la rama como activa. No depende de igualdad exacta de
// pathname — usa matchesActivePrefix para rutas hijas (detalle, edición,
// sub-secciones) que no coinciden literalmente con ningún href del árbol.
export function isTreeActive(pathname, item) {
  return (
    matchesActivePrefix(pathname, item.activePrefix) ||
    isItemActive(pathname, item.href) ||
    (item.children || []).some((child) => isTreeActive(pathname, child))
  );
}

// Devuelve claves jerárquicas únicamente para carpetas que contienen la ruta
// activa. La clave incluye todos sus ancestros para que dos carpetas con el
// mismo label en ramas distintas mantengan estado independiente.
export function activeTreeKeys(items, pathname, parentKey = "") {
  return items.flatMap((item) => {
    if (!item.children?.length || !isTreeActive(pathname, item)) return [];
    const key = parentKey ? `${parentKey}/${item.label}` : item.label;
    return [key, ...activeTreeKeys(item.children, pathname, key)];
  });
}

export function toggleExpandedNode(openKeys, key) {
  const current = Array.isArray(openKeys) ? openKeys : [];
  return current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
}

export function initialExpandedNodes({ storedOpenKeys, items, pathname }) {
  return Array.isArray(storedOpenKeys) ? storedOpenKeys : activeTreeKeys(items, pathname);
}

// Una empresa Cliente con un solo producto contratado (Off Street u On
// Street, nunca ambos) no debe navegar por "Estacionamientos > <producto>":
// se le presenta directamente el nodo del producto, promovido al lugar
// donde vivía "Estacionamientos" (ver §17/§18 de la auditoría de acceso por
// producto). Actúa sobre `items` ya filtrados por visibilidad/producto
// (navigationVisibleForRole ya habrá quitado "Off Street" u "On Street"
// según corresponda) -- aquí solo se decide cómo presentar lo que quedó:
//   - 2 hijos visibles (ambos productos, o Root): sin cambios.
//   - 1 hijo visible: se reemplaza el nodo padre por ese hijo, promovido.
//   - 0 hijos visibles: se elimina el nodo (nada que mostrar).
// Root nunca debe llamar a esta función (conserva el árbol completo siempre,
// ver §6) -- queda a criterio del llamador (Sidebar/MobileNavigation) no
// aplicarla para platform_admin.
// Filtra el árbol de navegación con un predicado de visibilidad por-ítem
// (p. ej. navigationVisibleForRole), aplicado recursivamente a los hijos.
// Un padre con hijos (p. ej. "Estacionamientos") sobrevive si CUALQUIERA de
// sus hijos sigue siendo visible tras filtrar, incluso si el href propio del
// padre no lo es -- "Estacionamientos" solo tiene sentido como href directo
// para Off Street (?tipo=OFF_STREET), así que filtrarlo únicamente por su
// propio href dejaría a un Cliente exclusivamente On Street sin el nodo
// ANTES de que projectSingleProductParkingNode pueda promover "On Street"
// en su lugar (ver §17/§18 de la auditoría de acceso por producto). Sidebar
// y MobileNavigation comparten esta misma función -- no hay una segunda
// copia del criterio (ver §34).
export function filterVisibleTree(items, isVisible) {
  return items
    .map((item) => (item.children?.length ? { ...item, children: filterVisibleTree(item.children, isVisible) } : item))
    .filter((item) => (item.children?.length !== undefined ? item.children.length > 0 || isVisible(item) : isVisible(item)));
}

export function projectSingleProductParkingNode(items, parentLabel = "Estacionamientos") {
  return items.flatMap((item) => {
    if (item.label !== parentLabel) return [item];
    const children = item.children || [];
    if (children.length === 0) return [];
    if (children.length === 1) return [{ ...children[0] }];
    return [item];
  });
}
