// Lógica pura del detalle de estacionamiento (orden de pestañas, acción contextual del
// encabezado y comparación de capacidad vs. plazas contratadas), separada de la capa
// visual para poder probarla sin depender de React/Next.

export const PARKING_DETAIL_TAB_KEYS = Object.freeze(["resumen", "estructura", "tarifas", "operadores", "infraestructura"]);

const BASE_TABS = Object.freeze([
  { key: "resumen", label: "Resumen" },
  { key: "estructura", label: null },
  { key: "tarifas", label: "Tarifas" },
  { key: "operadores", label: "Operadores" },
  { key: "infraestructura", label: "Infraestructura" },
]);

export function parkingDetailTabs(parking) {
  const onStreet = parking?.type === "ON_STREET";
  return BASE_TABS.map((tab) => (tab.key === "estructura" ? { ...tab, label: onStreet ? "Sectores y Calles" : "Niveles y Zonas" } : tab));
}

export function structureCreateHref(parking) {
  const onStreet = parking?.type === "ON_STREET";
  return `/estacionamientos/${parking?.code}/${onStreet ? "sectores" : "niveles"}/nuevo`;
}

export function structureCreateLabel(parking) {
  return parking?.type === "ON_STREET" ? "Crear área" : "Crear nivel";
}

// Determina qué acción contextual corresponde al encabezado según la pestaña activa.
// "estructura" y "tarifas" son las únicas con una acción de creación existente que
// reutilizar; el resto no debe mostrar ninguna acción adicional.
export function headerActionForTab(activeTab) {
  if (activeTab === "estructura") return "estructura";
  if (activeTab === "tarifas") return "tarifas";
  return null;
}

export function evaluateContractedCapacity(capacidadOperativa, plazasContratadas) {
  const overCapacity = typeof plazasContratadas === "number" && Number.isFinite(capacidadOperativa) && capacidadOperativa > plazasContratadas;
  return { overCapacity };
}
