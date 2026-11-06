// Orden y búsqueda del menú de los portales Cliente y Root (SOL-2026-11-04-014 y
// SOL-2026-11-05-001). Solo presenta lo
// que ya dejó visible el filtro de permisos: no agrega ni concede ninguna opción.
export const CLIENT_MENU_SECTIONS = Object.freeze([
  { id: "plataforma", title: "Plataforma", labels: ["Off Street", "On Street", "Inicio", "Dashboard General"] },
  { id: "administracion", title: "Administración", labels: ["Centro de Control SMS", "Administradores", "Operadores", "Claves de operadores", "Seguridad", "Mi Cuenta", "Convenios"] },
  { id: "soporte", title: "Soporte", labels: ["Documentación"] },
]);

export const ROOT_MENU_SECTIONS = Object.freeze([
  { id: "plataforma", title: "Plataforma", labels: ["Off Street", "On Street", "Inicio", "Dashboard General", "Data Entry"] },
  { id: "administracion", title: "Administración", labels: ["Centro de Control SMS", "Facturación", "Administración"] },
]);

// La carpeta de un producto no contratado no se muestra, aunque alguna de sus rutas
// no dependa del producto (Off Street incluye opciones como Monitoreo o Abonados).
export function hideUnhiredProducts(items = [], enabledProducts = []) {
  const hidden = { "Off Street": "OFF_STREET", "On Street": "ON_STREET" };
  return items.filter((item) => !hidden[item.label] || enabledProducts.includes(hidden[item.label]));
}

// Una opción nueva que nadie ubicó aquí queda en Administración: nunca desaparece.
export function portalMenuSections(items = [], definitions = CLIENT_MENU_SECTIONS) {
  const known = new Set(definitions.flatMap((section) => section.labels));
  const unplaced = items.filter((item) => !known.has(item.label));
  return definitions.map((section) => ({
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

const digits = (value) => String(value || "").replace(/[^0-9kK]/g, "").toLowerCase();

// Búsqueda de empresas (nombre, razón social o RUT) y estacionamientos (nombre, código o
// empresa). Basta con las primeras letras o números; no distingue tildes ni mayúsculas, y
// el RUT se compara sin puntos ni guion.
export function searchEntities({ companies = [], parkings = [] } = {}, query = "", limit = 6) {
  const term = normalizeMenuText(query);
  if (!term) return { companies: [], parkings: [] };
  const termDigits = digits(term);
  const byRut = termDigits.length >= 2 && /^[0-9.\-kK ]+$/.test(term);
  const matches = (texts, rut) => texts.some((text) => normalizeMenuText(text).includes(term)) || (byRut && digits(rut).startsWith(termDigits));
  const found = {
    companies: companies.filter((company) => matches([company.nombreFantasia, company.razonSocial], `${company.rutNumero || ""}${company.rutDv || ""}`)),
    parkings: parkings.filter((parking) => matches([parking.name, parking.code, parking.companyName], "")),
  };
  return { companies: found.companies.slice(0, limit), parkings: found.parkings.slice(0, limit), more: found.companies.length > limit || found.parkings.length > limit };
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
