// Motor común de reportes (SOL-2026-10-28-005, E2). Registro único de
// reportes Off Street y On Street organizado en árbol:
// Producto → Reportes → Categoría → Reporte. Puro (sin red): lo usan la API,
// la pantalla, las pruebas y, a futuro, Smart Reports (SOL-2026-10-28-001).
//
// Estados de disponibilidad:
// - AVAILABLE: conectado a datos reales y probado.
// - PLANNED: definido, aún sin implementar en este motor.
// - EXPERIMENTAL: predictivo o sin validación suficiente (se identifica así).
// - NOT_APPLICABLE: sin modelo de datos en ese producto.

export const REPORT_STATUS = Object.freeze({ AVAILABLE: "AVAILABLE", PLANNED: "PLANNED", EXPERIMENTAL: "EXPERIMENTAL", NOT_APPLICABLE: "NOT_APPLICABLE" });
export const REPORT_STATUS_LABELS = Object.freeze({ AVAILABLE: "Disponible", PLANNED: "Próximamente", EXPERIMENTAL: "Experimental", NOT_APPLICABLE: "No aplica" });

const A = "AVAILABLE";
const r = (id, label, status = REPORT_STATUS.PLANNED, extra = {}) => ({ id, label, status, filters: ["period", "parking"], ...extra });
const plate = (id, label, status = REPORT_STATUS.PLANNED, extra = {}) => r(id, label, status, { filters: ["period", "plate", "status"], ...extra });

export const REPORT_TREE = Object.freeze([
  {
    id: "off-street",
    label: "Off Street",
    categories: [
      {
        id: "off-patentes",
        label: "A. Patentes Autorizadas",
        reports: [
          plate("pl-listado", "Listado general de patentes", A, { description: "Todas las patentes liberadas de la empresa que se cruzan con el período, con su estado a la fecha de emisión." }),
          plate("pl-gratuitas", "Autorizaciones gratuitas", A, { description: "Patentes sin costo para el beneficiario cuya vigencia se cruza con el período." }),
          plate("pl-terceros", "Autorizaciones cobradas a terceros", A, { description: "Patentes con factura a un tercero. Valores netos por moneda (UF y $ no se suman), más IVA; son importes del cliente, no de ParkFacil." }),
          r("pl-vigentes", "Autorizaciones vigentes", A, { filters: ["plate"], description: "Patentes vigentes a la fecha y hora de emisión, con horas restantes. El período no aplica." }),
          r("pl-programadas", "Autorizaciones programadas", A, { filters: ["plate"], description: "Patentes cuyo período aún no comienza, con horas hasta el inicio. El período no aplica." }),
          r("pl-vencimientos", "Próximos vencimientos", A, { filters: ["plate", "window"], description: "Patentes vigentes que vencen dentro de la ventana elegida (7, 15 o 30 días), de la más próxima a la más lejana." }),
          plate("pl-vencidas", "Autorizaciones vencidas", A, { description: "Patentes cuyo término cayó dentro del período, o que agotaron sus usos." }),
          plate("pl-finalizadas", "Finalizadas y eliminadas", A, { description: "Patentes finalizadas antes de su término o eliminadas (lógico) dentro del período, con quién y cuándo." }),
          r("pl-historial", "Historial por patente", A, { filters: ["period", "plate"], description: "Eventos inmutables dentro del período: creación, importación, edición, entradas, finalización, eliminación y restauración." }),
          r("pl-organizacion", "Por empresa u organización", A, { filters: ["period"], description: "Patentes agrupadas por el tercero que paga (organización) y las sin costo, con entradas y valores netos por moneda." }),
          r("pl-uso", "Uso del beneficio", A, { filters: ["period", "parking", "plate"], description: "Estadías ingresadas con Pago liberado en el período: minutos cubiertos, minutos cobrados y excedente pagado." }),
        ],
      },
      {
        id: "off-ocupacion",
        label: "B. Ocupación histórica",
        reports: [
          r("oc-hora", "Ocupación por hora"), r("oc-dia", "Ocupación por día"), r("oc-semana-mes", "Ocupación por semana y mes"),
          r("oc-usabilidad", "Usabilidad del estacionamiento"), r("oc-peak", "Horas peak"), r("oc-dias-uso", "Días de mayor uso"),
          r("oc-max-min", "Ocupación máxima y mínima"), r("oc-plazas", "Plazas ocupadas y disponibles"), r("oc-promedio", "Tiempo promedio de estadía"),
          r("oc-rotacion", "Rotación de vehículos"), r("oc-calidad", "Calidad de datos y casos no calculables"),
        ],
      },
      {
        id: "off-movimientos",
        label: "C. Movimientos",
        reports: [
          r("mv-entradas-salidas", "Entradas versus salidas"), r("mv-entradas", "Entradas por fecha y hora"), r("mv-salidas", "Salidas por fecha y hora"),
          r("mv-patente", "Detalle individual por patente"), r("mv-diferencia", "Diferencia entre entradas y salidas"), r("mv-saldo", "Saldo inicial y final de vehículos"),
          r("mv-flujo", "Flujo por hora y día"), r("mv-comparacion", "Comparación entre períodos"),
        ],
      },
      {
        id: "off-recaudacion",
        label: "D. Recaudación",
        reports: [
          r("rc-periodo", "Recaudación por día, semana y mes"), r("rc-estacionamiento", "Recaudación por estacionamiento"), r("rc-medios", "Medios de pago"),
          r("rc-ticket", "Ticket promedio"), r("rc-turnos", "Turnos y cierres de caja"), r("rc-diferencias", "Diferencias de caja"),
          r("rc-deudas", "Deudas y pagos pendientes"), r("rc-tarifas", "Tarifas aplicadas"),
        ],
      },
      {
        id: "off-analisis",
        label: "E. Análisis avanzado",
        reports: [
          r("an-demanda", "Horarios de mayor demanda"), r("an-calor", "Mapas de calor por día y hora"), r("an-comparacion", "Comparación entre estacionamientos"),
          r("an-tendencias", "Tendencias históricas"), r("an-prediccion", "Predicción de ocupación", REPORT_STATUS.EXPERIMENTAL),
        ],
      },
    ],
  },
  {
    id: "on-street",
    label: "On Street",
    categories: [
      { id: "on-patentes", label: "A. Patentes Autorizadas", reports: [r("on-pl", "Patentes autorizadas On Street", REPORT_STATUS.NOT_APPLICABLE, { description: "No existe un modelo de patentes autorizadas en On Street." })] },
      { id: "on-ocupacion", label: "B. Ocupación y usabilidad", reports: [r("on-oc-zona", "Ocupación por zona"), r("on-oc-calle", "Ocupación por calle"), r("on-oc-tramo", "Ocupación por tramo"), r("on-oc-calor", "Mapa de calor por calle y horario")] },
      { id: "on-sesiones", label: "C. Sesiones", reports: [r("on-se-estado", "Sesiones por estado"), r("on-se-extensiones", "Extensiones de estadía"), r("on-se-duracion", "Duración promedio")] },
      { id: "on-recaudacion", label: "D. Recaudación", reports: [r("on-rc-ubicacion", "Recaudación por zona, calle y tramo"), r("on-rc-operador", "Recaudación por operador"), r("on-rc-medios", "Medios de pago")] },
      { id: "on-fiscalizacion", label: "E. Fiscalización", reports: [r("on-fi-registros", "Fiscalizaciones registradas"), r("on-fi-inspector", "Fiscalizaciones por inspector"), r("on-fi-sms", "Avisos SMS y resultados"), r("on-fi-reincidentes", "Vehículos reincidentes")] },
      { id: "on-analisis", label: "F. Análisis avanzado", reports: [r("on-an-demanda", "Horarios de mayor demanda"), r("on-an-prediccion", "Predicción de disponibilidad por calle", REPORT_STATUS.EXPERIMENTAL)] },
    ],
  },
]);

export function flattenReports(tree = REPORT_TREE) {
  return tree.flatMap((product) => product.categories.flatMap((category) => category.reports.map((report) => ({ ...report, productId: product.id, productLabel: product.label, categoryId: category.id, categoryLabel: category.label }))));
}

export function findReport(id, tree = REPORT_TREE) {
  return flattenReports(tree).find((report) => report.id === id) || null;
}

const normalize = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Búsqueda: reportes cuyo nombre, categoría o producto contienen el texto
// (sin distinguir tildes ni mayúsculas). Devuelve ids de nodos visibles.
export function searchTree(query, tree = REPORT_TREE) {
  const q = normalize(query).trim();
  if (!q) return null;
  const visible = new Set();
  for (const product of tree) {
    for (const category of product.categories) {
      for (const report of category.reports) {
        if ([report.label, category.label, product.label].some((text) => normalize(text).includes(q))) {
          visible.add(report.id); visible.add(category.id); visible.add(product.id);
        }
      }
    }
  }
  return visible;
}

// Lista plana de nodos visibles en orden (para teclado): productos y
// categorías expandidos muestran sus hijos.
export function visibleNodes(tree, expanded, filter = null) {
  const nodes = [];
  const show = (id) => !filter || filter.has(id);
  for (const product of tree) {
    if (!show(product.id)) continue;
    nodes.push({ id: product.id, level: 1, type: "product", parentId: null });
    if (!expanded.has(product.id) && !filter) continue;
    for (const category of product.categories) {
      if (!show(category.id)) continue;
      nodes.push({ id: category.id, level: 2, type: "category", parentId: product.id });
      if (!expanded.has(category.id) && !filter) continue;
      for (const report of category.reports) {
        if (show(report.id)) nodes.push({ id: report.id, level: 3, type: "report", parentId: category.id });
      }
    }
  }
  return nodes;
}

// Navegación por teclado (patrón WAI-ARIA tree): devuelve la acción a aplicar.
export function treeKeyAction(key, nodes, focusedId, expanded) {
  const index = nodes.findIndex((node) => node.id === focusedId);
  const node = nodes[index];
  if (!node) return nodes[0] ? { focus: nodes[0].id } : null;
  switch (key) {
    case "ArrowDown": return nodes[index + 1] ? { focus: nodes[index + 1].id } : null;
    case "ArrowUp": return nodes[index - 1] ? { focus: nodes[index - 1].id } : null;
    case "Home": return { focus: nodes[0].id };
    case "End": return { focus: nodes[nodes.length - 1].id };
    case "ArrowRight":
      if (node.type === "report") return null;
      return expanded.has(node.id) ? (nodes[index + 1] && nodes[index + 1].parentId === node.id ? { focus: nodes[index + 1].id } : null) : { expand: node.id };
    case "ArrowLeft":
      if (node.type !== "report" && expanded.has(node.id)) return { collapse: node.id };
      return node.parentId ? { focus: node.parentId } : null;
    case "Enter":
    case " ":
      return node.type === "report" ? { select: node.id } : { toggle: node.id };
    default: return null;
  }
}

// Subárbol con solo las categorías indicadas (opción B, SOL-2026-10-28-005:
// «Reportes Pago liberado» muestra únicamente A. Patentes Autorizadas).
export function subTree(categoryIds, tree = REPORT_TREE) {
  if (!categoryIds?.length) return tree;
  return tree
    .map((product) => ({ ...product, categories: product.categories.filter((category) => categoryIds.includes(category.id)) }))
    .filter((product) => product.categories.length);
}

// Ancestros de un reporte (para expandir el camino del reporte activo).
export function reportAncestors(id, tree = REPORT_TREE) {
  const report = findReport(id, tree);
  return report ? [report.productId, report.categoryId] : [];
}
