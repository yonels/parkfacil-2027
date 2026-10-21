"use client";
// Listados administrativos de Área/Calle/Tramo On Street (§14/§15/§16 de la
// reorganización 2026-08-28, corregido §2/§3 de la auditoría posterior de
// "fichas propias On Street"). Reutiliza ParkFacilDataGrid (no crea una
// grilla paralela) y NO duplica lógica de negocio: las fichas de Área/Calle
// (/on-street-qr/areas/[id], /on-street-qr/calles/[id]) envuelven el mismo
// StructureEntityForm/StreetSegmentsManager/endpoint PATCH que ya usa Off
// Street -- ver OnStreetAreaDetail.js/OnStreetStreetDetail.js -- pero la
// URL, el breadcrumb, el AppShell y la navegación activa quedan siempre
// dentro de /on-street-qr, nunca redirigen a /estacionamientos/... como
// experiencia final. No existe una página de ficha propia para Tramo (la
// edición de tramos vive embebida en la ficha de su Calle, ver
// StreetSegmentsManager) -- el click en un tramo abre la ficha On Street de
// su Calle, donde el tramo es editable.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";

const dt = (v) => (v ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "—");
const ESTADO_LABEL = { ACTIVE: "Activo", INACTIVE: "Inactivo" };

const KIND_CONFIG = {
  areas: {
    endpoint: "areas",
    title: "Áreas",
    newHref: "/on-street-qr/areas/nueva",
    newLabel: "Nueva área",
    emptyMessage: "No hay áreas On Street registradas todavía.",
    exportFilename: "on_street_areas",
    storageKey: "on-street:areas",
    fichaHref: (row) => `/on-street-qr/areas/${row.id}`,
    columns: [
      { key: "name", label: "Nombre" },
      { key: "code", label: "Código", render: (v) => v || "—" },
      { key: "company", label: "Empresa", getValue: (r) => r.parking?.companyName, render: (v) => v || "—" },
      { key: "parking", label: "Estacionamiento", getValue: (r) => r.parking?.name, render: (v) => v || "—" },
      { key: "streetCount", label: "Calles", render: (v) => v ?? 0 },
      { key: "status", label: "Estado", render: (v) => ESTADO_LABEL[v] || v || "—" },
      { key: "capacity", label: "Capacidad", render: (v) => v ?? "—" },
      { key: "created_at", label: "Creación", render: dt },
    ],
  },
  calles: {
    endpoint: "calles",
    title: "Calles",
    newHref: "/on-street-qr/calles/nueva",
    newLabel: "Nueva calle",
    emptyMessage: "No hay calles On Street registradas todavía.",
    exportFilename: "on_street_calles",
    storageKey: "on-street:calles",
    fichaHref: (row) => `/on-street-qr/calles/${row.id}`,
    columns: [
      { key: "name", label: "Nombre" },
      { key: "company", label: "Empresa", getValue: (r) => r.parking?.companyName, render: (v) => v || "—" },
      { key: "parking", label: "Estacionamiento", getValue: (r) => r.parking?.name, render: (v) => v || "—" },
      { key: "area", label: "Área", getValue: (r) => r.area?.name, render: (v) => v || "—" },
      { key: "segmentCount", label: "Tramos", render: (v) => v ?? 0 },
      { key: "status", label: "Estado", render: (v) => ESTADO_LABEL[v] || v || "—" },
      { key: "created_at", label: "Creación", render: dt },
    ],
  },
  tramos: {
    endpoint: "tramos",
    title: "Tramos",
    newHref: "/on-street-qr/tramos/nuevo",
    newLabel: "Nuevo tramo",
    emptyMessage: "No hay tramos On Street registrados todavía.",
    exportFilename: "on_street_tramos",
    storageKey: "on-street:tramos",
    // No hay ficha propia de Tramo: se abre la ficha On Street de su Calle,
    // donde el tramo es editable (ver comentario de cabecera).
    fichaHref: (row) => (row.street?.id ? `/on-street-qr/calles/${row.street.id}` : null),
    columns: [
      { key: "name", label: "Nombre" },
      { key: "code", label: "Código", render: (v) => v || "—" },
      { key: "company", label: "Empresa", getValue: (r) => r.parking?.companyName, render: (v) => v || "—" },
      { key: "parking", label: "Estacionamiento", getValue: (r) => r.parking?.name, render: (v) => v || "—" },
      { key: "area", label: "Área", getValue: (r) => r.area?.name, render: (v) => v || "—" },
      { key: "street", label: "Calle", getValue: (r) => r.street?.name, render: (v) => v || "—" },
      { key: "from_number", label: "N° desde", render: (v) => v ?? "—" },
      { key: "to_number", label: "N° hasta", render: (v) => v ?? "—" },
      { key: "side", label: "Lado" },
      { key: "capacity", label: "Capacidad", render: (v) => v ?? "—" },
      { key: "occupied_spaces", label: "Ocupación", render: (v) => v ?? "—" },
      { key: "status", label: "Estado", render: (v) => ESTADO_LABEL[v] || v || "—" },
    ],
  },
};

export default function OnStreetHierarchyWorkspace({ kind }) {
  const router = useRouter();
  const config = KIND_CONFIG[kind];

  const [companies, setCompanies] = useState([]);
  const [rows, setRows] = useState([]);
  const [options, setOptions] = useState({});
  const [filters, setFilters] = useState({ companyId: "", parkingId: "", areaId: "", streetId: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await authenticatedFetch("/api/on-street-qr/companies", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (active && response.ok) setCompanies(body.data || []);
      } catch {
        // Selector Empresa simplemente no aparece.
      }
    })();
    return () => { active = false; };
  }, []);

  // Contexto precargado desde la ficha de un Proyecto On Street (§19
  // "Estructura" del constructor de Proyecto, 2026-08-28): ?parkingId=...
  // preselecciona el filtro Estacionamiento, sin obligar a re-elegirlo --
  // mismo patrón ya usado en OnStreetWorkspace.js para ?segmentId=.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const parkingId = new URLSearchParams(window.location.search).get("parkingId");
      if (parkingId) setFilters((current) => ({ ...current, parkingId }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
      const response = await authenticatedFetch(`/api/on-street-qr/${config.endpoint}?${query}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      if (!response.ok) throw new Error(body.error || `No fue posible cargar ${config.title.toLowerCase()}.`);
      setRows(body.data?.rows || []);
      setOptions(body.data?.options || {});
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [filters, config.endpoint, config.title]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  // Cascada Empresa->Estacionamiento->Área->Calle (§9 de la reorganización):
  // cambiar un nivel superior limpia los inferiores, nunca combinaciones
  // jerárquicas imposibles.
  function setCompanyId(value) { setFilters({ companyId: value, parkingId: "", areaId: "", streetId: "" }); }
  function setParkingId(value) { setFilters((current) => ({ ...current, parkingId: value, areaId: "", streetId: "" })); }
  function setAreaId(value) { setFilters((current) => ({ ...current, areaId: value, streetId: "" })); }
  function setStreetId(value) { setFilters((current) => ({ ...current, streetId: value })); }

  const areas = useMemo(() => options.areas || [], [options.areas]);
  const streets = useMemo(() => (options.streets || []).filter((s) => !filters.areaId || s.sector_id === filters.areaId || s.sectorId === filters.areaId), [options.streets, filters.areaId]);

  function abrirFicha(row) {
    const href = config.fichaHref(row);
    if (href) router.push(href);
  }

  // Columna de acción visible (además del doble clic en la fila, mismo
  // patrón que OnStreetLocationsWorkspace.js) -- "Ficha" enlaza directo a la
  // ficha real ya existente (ver KIND_CONFIG.fichaHref arriba).
  const columnsWithFicha = useMemo(() => [
    ...config.columns,
    {
      key: "_ficha",
      label: "Acciones",
      getValue: () => null,
      render: (_value, row) => {
        const href = config.fichaHref(row);
        return href ? (
          <Link href={href} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[var(--pf-color-onstreet-primary)] hover:text-[var(--pf-color-onstreet-primary)]">Ficha</Link>
        ) : <span className="text-xs text-slate-400">—</span>;
      },
    },
  ], [config]);

  return (
    <section className="space-y-4">
      {/* "Volver" real de historial (2026-08-30) -- ver nota en
          OnStreetAdminPage.js. Este listado no envuelve en AppShell (a
          diferencia del resto de fichas On Street), así que el botón vive
          en el propio contenido en vez del encabezado del layout. */}
      <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" />Volver</button>
      <div className="grid gap-3 rounded-2xl bg-white p-4 sm:grid-cols-2 xl:grid-cols-5">
        {companies.length > 1 ? (
          <label className="text-xs font-semibold text-slate-600">
            Empresa
            <select value={filters.companyId} onChange={(e) => setCompanyId(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">Todas</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        ) : null}
        <label className="text-xs font-semibold text-slate-600">
          Estacionamiento
          <select value={filters.parkingId} onChange={(e) => setParkingId(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">Todos</option>
            {(options.parkings || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {kind !== "areas" ? (
          <label className="text-xs font-semibold text-slate-600">
            Área
            <select value={filters.areaId} onChange={(e) => setAreaId(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">Todas</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ${a.name}` : a.name}</option>)}
            </select>
          </label>
        ) : null}
        {kind === "tramos" ? (
          <label className="text-xs font-semibold text-slate-600">
            Calle
            <select value={filters.streetId} onChange={(e) => setStreetId(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">Todas</option>
              {streets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Link href={config.newHref} className="inline-flex items-center gap-2 rounded-full bg-[var(--pf-color-onstreet-primary)] px-4 py-2 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" />{config.newLabel}
        </Link>
      </div>

      {error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p> : null}

      {loading ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando…</div>
      ) : (
        <ParkFacilDataGrid
          storageKey={config.storageKey}
          columns={columnsWithFicha}
          rows={rows}
          onRowDoubleClick={abrirFicha}
          emptyMessage={config.emptyMessage}
          exportFilename={config.exportFilename}
        />
      )}
    </section>
  );
}
