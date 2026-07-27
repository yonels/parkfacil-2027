import "server-only";

import { mapDbRowsToAbonados } from "@/lib/abonados";

const SORT_COLUMNS = {
  codigo: "codigo",
  nombre: "nombre",
  rut: "rut",
  correo: "correo",
  telefono: "telefono",
  estado: "estado",
  inicio: "fecha_inicio",
  termino: "fecha_termino",
  updatedAt: "updated_at",
};

function clampLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if ([25, 50, 100].includes(parsed)) return parsed;
  if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, 100);
  return 50;
}

function normalizePage(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeDirection(value) {
  return value === "desc" ? "desc" : "asc";
}

export function parseAbonadosListParams(searchParams = new URLSearchParams()) {
  const page = normalizePage(searchParams.get("page"));
  const limit = clampLimit(searchParams.get("limit"));
  const sort = SORT_COLUMNS[searchParams.get("sort")] ? searchParams.get("sort") : "codigo";
  const direction = normalizeDirection(searchParams.get("direction"));

  return {
    page,
    limit,
    search: String(searchParams.get("search") || "").trim(),
    estado: String(searchParams.get("estado") || "Todos"),
    responsable: String(searchParams.get("responsable") || "Todos"),
    vigencia: String(searchParams.get("vigencia") || "Todos"),
    sort,
    direction,
  };
}

function applyBaseFilters(query, params) {
  let nextQuery = query;

  if (params.estado && params.estado !== "Todos") {
    nextQuery = nextQuery.eq("estado", params.estado);
  }

  if (params.responsable && params.responsable !== "Todos") {
    nextQuery = nextQuery.eq("responsable_id", params.responsable);
  }

  if (params.search) {
    const term = params.search.replace(/[%_]/g, "");
    nextQuery = nextQuery.or(`codigo.ilike.%${term}%,nombre.ilike.%${term}%,rut.ilike.%${term}%,correo.ilike.%${term}%,telefono.ilike.%${term}%`);
  }

  return nextQuery;
}

export async function fetchAbonadosBundle(supabase, params = {}) {
  const page = params.page || 1;
  const limit = params.limit || 50;
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const sortColumn = SORT_COLUMNS[params.sort] || SORT_COLUMNS.codigo;
  const ascending = params.direction !== "desc";

  let query = supabase
    .from("abonados")
    .select("*", { count: "exact" })
    .order(sortColumn, { ascending });

  if (params.id) {
    query = query.eq("id", params.id).limit(1);
  } else {
    query = query.range(from, to);
  }

  query = applyBaseFilters(query, params);

  const { data: abonadosRows, error: abonadosError, count } = await query;
  if (abonadosError) throw abonadosError;

  const rows = abonadosRows || [];
  if (rows.length === 0) {
    return { data: [], total: count || 0, page, limit, totalPages: Math.max(1, Math.ceil((count || 0) / limit)) };
  }

  const ids = rows.map((row) => row.id);
  const responsableIds = [...new Set(rows.map((row) => row.responsable_id).filter(Boolean))];

  const [vehiculosResult, credencialesResult, responsablesResult] = await Promise.all([
    supabase.from("abonado_vehiculos").select("*").in("abonado_id", ids).order("is_primary", { ascending: false }),
    supabase.from("abonado_credenciales").select("*").in("abonado_id", ids).order("created_at", { ascending: true }),
    responsableIds.length > 0 ? supabase.from("abonado_responsables").select("*").in("id", responsableIds) : Promise.resolve({ data: [], error: null }),
  ]);

  if (vehiculosResult.error) throw vehiculosResult.error;
  if (credencialesResult.error) throw credencialesResult.error;
  if (responsablesResult.error) throw responsablesResult.error;

  return {
    data: mapDbRowsToAbonados(rows, vehiculosResult.data || [], credencialesResult.data || [], responsablesResult.data || []),
    total: count || 0,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
  };
}

export async function fetchAllAbonadosForExport(supabase, params = {}) {
  const limit = 100;
  const first = await fetchAbonadosBundle(supabase, { ...params, page: 1, limit });
  const all = [...first.data];

  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await fetchAbonadosBundle(supabase, { ...params, page, limit });
    all.push(...next.data);
  }

  return all;
}

