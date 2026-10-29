// Motor común de reportes (SOL-2026-10-28-005, E5): lectura por páginas.
// PostgREST (Supabase) entrega como máximo `max_rows` filas por consulta
// (1.000 en este proyecto) y corta en silencio; un reporte debe leer todas
// las filas autorizadas. `makeQuery` crea la consulta con un orden estable
// (incluir una columna única al final) y aquí se recorre con range().
// Si se supera `max`, error EXPORT_TOO_LARGE (el reporte pide acotar filtros).

export const PAGE_SIZE = 1000;

export async function fetchAllRows(makeQuery, { pageSize = PAGE_SIZE, max = 50000 } = {}) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (rows.length > max) throw Object.assign(new Error("EXPORT_TOO_LARGE"), { limit: max });
    if (!data || data.length < pageSize) return rows;
  }
}
