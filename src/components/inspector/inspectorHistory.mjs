// Lógica pura de combinación de historial (Etapa 1, sección 15), separada de
// InspectorHistorial.js (que tiene JSX y por lo tanto no puede importarse
// directamente con node --test) para poder probarla en directo.
export function buildInspectorHistory(history, fiscalizaciones) {
  const consultas = history.map((h) => ({ plate: h.plate, tipo: "Consulta", status: h.status, at: h.at }));
  const fiscas = fiscalizaciones.map((f) => ({ plate: f.plate, tipo: "Fiscalización", status: null, motivo: f.motivo, at: f.at }));
  return [...consultas, ...fiscas].sort((a, b) => new Date(b.at) - new Date(a.at));
}
