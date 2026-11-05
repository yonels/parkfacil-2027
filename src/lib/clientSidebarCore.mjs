// Orden y búsqueda del menú del Portal Cliente (SOL-2026-11-04-014). Solo presenta lo
// que ya dejó visible el filtro de permisos: no agrega ni concede ninguna opción.
export const CLIENT_MENU_SECTIONS = Object.freeze([
  { id: "plataforma", title: "Plataforma", labels: ["Off Street", "On Street", "Inicio", "Dashboard General"] },
  { id: "administracion", title: "Administración", labels: ["Centro de Control SMS", "Administradores", "Operadores", "Claves de operadores", "Seguridad", "Mi Cuenta", "Convenios"] },
  { id: "soporte", title: "Soporte", labels: ["Documentación"] },
]);

// La carpeta de un producto no contratado no se muestra, aunque alguna de sus rutas
// no dependa del producto (Off Street incluye opciones como Monitoreo o Abonados).
export function hideUnhiredProducts(items = [], enabledProducts = []) {
  const hidden = { "Off Street": "OFF_STREET", "On Street": "ON_STREET" };
  return items.filter((item) => !hidden[item.label] || enabledProducts.includes(hidden[item.label]));
}

// Una opción nueva que nadie ubicó aquí queda en Administración: nunca desaparece.
export function clientMenuSections(items = []) {
  const known = new Set(CLIENT_MENU_SECTIONS.flatMap((section) => section.labels));
  const unplaced = items.filter((item) => !known.has(item.label));
  return CLIENT_MENU_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    items: [
      ...section.labels.map((label) => items.find((item) => item.label === label)).filter(Boolean),
      ...(section.id === "administracion" ? unplaced : []),
    ],
  })).filter((section) => section.items.length > 0);
}

export function normalizeMenuText(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Una carpeta que coincide conserva todas sus opciones; si coincide solo un hijo,
// queda el camino hasta ese hijo.
export function filterMenuTree(items = [], query = "") {
  const term = normalizeMenuText(query);
  if (!term) return items;
  return items.flatMap((item) => {
    if (normalizeMenuText(item.label).includes(term)) return [item];
    const children = filterMenuTree(item.children || [], term);
    return children.length ? [{ ...item, children }] : [];
  });
}

export function countMenuOptions(item) {
  return item.children?.length ? item.children.reduce((sum, child) => sum + countMenuOptions(child), 0) : 1;
}

export function formatCompanyRut(number, dv) {
  const digits = String(number || "").replace(/\D/g, "");
  const check = String(dv || "").trim().toUpperCase();
  if (!digits || !check) return "";
  return `${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${check}`;
}
