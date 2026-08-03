"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import EmpresaResumen from "@/components/empresas/EmpresaResumen";
import EmpresasTable from "@/components/empresas/EmpresasTable";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const estados = ["Todos", "active", "inactive", "onboarding"];
const tipos = ["Todos", "client", "operator", "administrator", "partner", "supplier"];
const estacionamientos = ["Todos", "con", "sin", "OFF_STREET", "ON_STREET"];
const ramisFallback = {
  id: "ramis", razonSocial: "Sociedad Médica Integral Clínica Ramis Ltda.", nombreFantasia: "Clínica Ramis",
  rutNumero: "76345890", rutDv: "2", giro: "Servicios médicos y administración de infraestructura",
  direccion: "Av. Providencia 1840", comuna: "Providencia", ciudad: "Santiago", region: "Metropolitana", pais: "Chile",
  contactoPrincipal: "Carolina Muñoz", correo: "admin@clinicaramis.cl", telefono: "+56 2 2345 7788",
  representanteLegal: "Carolina Muñoz", estado: "active", tipoRelacion: "client",
  estacionamientos: [
    { id: "ramis-central", codigo: "PF-001", nombre: "Clínica Ramis Central", direccion: "Av. Providencia 1840", ciudad: "Santiago", pais: "Chile", tipo: "OFF_STREET", estado: "ACTIVE", capacidad: 320 },
    { id: "ramis-norte", codigo: "PF-002", nombre: "Clínica Ramis Norte", direccion: "Av. El Salto 4921", ciudad: "Huechuraba", pais: "Chile", tipo: "OFF_STREET", estado: "ACTIVE", capacidad: 180 },
    { id: "ramis-urgencias", codigo: "PF-003", nombre: "Clínica Ramis Urgencias", direccion: "Los Leones 955", ciudad: "Santiago", pais: "Chile", tipo: "OFF_STREET", estado: "INACTIVE", capacidad: 96 },
  ],
};

function mergeCompanyFallback(data) {
  const unique = new Map();
  data.forEach((company) => {
    const key = `${company.rutNumero}-${company.rutDv}`;
    const current = unique.get(key);
    unique.set(key, current ? { ...current, estacionamientos: [...current.estacionamientos, ...company.estacionamientos.filter((parking) => !current.estacionamientos.some((item) => item.id === parking.id))] } : company);
  });
  if (!unique.has("76345890-2")) unique.set("76345890-2", ramisFallback);
  return [...unique.values()];
}

function labelEstado(estado) {
  const labels = {
    active: "Activa",
    inactive: "Inactiva",
    onboarding: "En implementación",
  };

  return labels[estado] ?? estado;
}

function labelTipo(tipo) {
  const labels = {
    client: "Cliente",
    operator: "Operador",
    administrator: "Administrador",
    partner: "Aliado",
    supplier: "Proveedor",
  };

  return labels[tipo] ?? tipo;
}

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState([ramisFallback]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("Todos");
  const [tipo, setTipo] = useState("Todos");
  const [ciudad, setCiudad] = useState("Todos");
  const [conEstacionamientos, setConEstacionamientos] = useState("Todos");

  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/empresas", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "No fue posible obtener las empresas.");
        if (active) setEmpresas(mergeCompanyFallback(Array.isArray(body.data) ? body.data : []));
      })
      .catch((error) => { if (active) setLoadError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const ciudades = useMemo(() => ["Todos", ...new Set(empresas.map((empresa) => empresa.ciudad))], [empresas]);

  const resultados = useMemo(() => {
    const query = busqueda.trim().toLowerCase();
    const base = mergeCompanyFallback(empresas).filter((empresa) => [
      empresa.razonSocial, empresa.nombreFantasia, empresa.rutNumero, empresa.contactoPrincipal,
      empresa.correo, empresa.telefono, empresa.representanteLegal, empresa.giro, empresa.direccion,
      empresa.comuna, empresa.ciudad, empresa.region, empresa.pais,
    ].some((value) => String(value || "").toLowerCase().includes(query)));

    return base.filter((empresa) => {
      const byEstado = estado === "Todos" || empresa.estado === estado;
      const byTipo = tipo === "Todos" || empresa.tipoRelacion === tipo;
      const byCiudad = ciudad === "Todos" || empresa.ciudad === ciudad;
      const byParking = conEstacionamientos === "Todos"
        || (conEstacionamientos === "con" && empresa.estacionamientos.length > 0)
        || (conEstacionamientos === "sin" && empresa.estacionamientos.length === 0)
        || (["OFF_STREET", "ON_STREET"].includes(conEstacionamientos) && empresa.estacionamientos.some((parking) => parking.tipo === conEstacionamientos));
      return byEstado && byTipo && byCiudad && byParking;
    });
  }, [empresas, busqueda, estado, tipo, ciudad, conEstacionamientos]);

  const resumen = useMemo(() => empresas.reduce((summary, empresa) => {
    summary.total += 1;
    summary[empresa.estado] = (summary[empresa.estado] || 0) + 1;
    if (empresa.estacionamientos.length) summary.conEstacionamientos += 1;
    return summary;
  }, { total: 0, active: 0, inactive: 0, onboarding: 0, conEstacionamientos: 0 }), [empresas]);

  return (
    <AppShell title="Empresas" description="Administración de organizaciones vinculadas a ParkFacil">
      <div className="space-y-6">
        <PageHeader
          title="Empresas"
          description="Administración de organizaciones, datos tributarios, contactos y estacionamientos asociados."
          actions={[
            <button key="nueva" className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
              <Plus className="h-4 w-4" />
              Crear empresa
            </button>,
          ]}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <EmpresaResumen title="Total de empresas" value={resumen.total} description="Registros persistentes" tone="info" />
          <EmpresaResumen title="Activas" value={resumen.active} description="Operan actualmente" tone="positive" />
          <EmpresaResumen title="Inactivas" value={resumen.inactive} description="Sin actividad actual" tone="warning" />
          <EmpresaResumen title="En implementación" value={resumen.onboarding} description="En proceso de incorporación" tone="neutral" />
          <EmpresaResumen title="Con estacionamientos" value={resumen.conEstacionamientos} description="Asociaciones de referencia" tone="warning" />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#041E42]">Catálogo empresarial</h3>
              <p className="mt-2 text-sm text-slate-600">Listado visual preparado para la gestión de organizaciones y su relación con estacionamientos.</p>
            </div>
            <StatusBadge variant="positive" uppercase={false}>Catálogo empresarial</StatusBadge>
          </div>

          <div className="mt-6 space-y-4">
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <Search className="h-4 w-4 text-[#3150D8]" />
              <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por razón social, fantasía, RUT, contacto, correo o ciudad" className="w-full bg-transparent outline-none" />
            </label>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 xl:items-center">
              <label className="order-3 flex min-w-0 items-center gap-3 text-sm text-slate-600">
                <span>Estado</span>
                <select value={estado} onChange={(event) => setEstado(event.target.value)} className="min-w-[140px] flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {estados.map((item) => <option key={item} value={item}>{item === "Todos" ? item : labelEstado(item)}</option>)}
                </select>
              </label>
              <label className="order-2 flex min-w-0 items-center gap-3 text-sm text-slate-600">
                <span>Relación</span>
                <select value={tipo} onChange={(event) => setTipo(event.target.value)} className="min-w-[140px] flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {tipos.map((item) => <option key={item} value={item}>{item === "Todos" ? item : labelTipo(item)}</option>)}
                </select>
              </label>
              <label className="order-1 flex min-w-0 items-center gap-3 text-sm text-slate-600">
                <span>Ciudad</span>
                <select value={ciudad} onChange={(event) => setCiudad(event.target.value)} className="min-w-[140px] flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {ciudades.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="order-4 flex min-w-0 items-center gap-3 text-sm text-slate-600">
                <span>Estacionamientos</span>
                <select value={conEstacionamientos} onChange={(event) => setConEstacionamientos(event.target.value)} className="min-w-[160px] flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {estacionamientos.map((item) => <option key={item} value={item}>{item === "Todos" ? item : item === "con" ? "Con asociados" : item === "sin" ? "Sin asociados" : item === "OFF_STREET" ? "Off Street" : "On Street"}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-6">
            {resultados.length > 0 ? (
              <EmpresasTable empresas={resultados} />
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
                No hay empresas que coincidan con los filtros aplicados.
              </div>
            )}
            {loading ? <p role="status" className="mt-3 text-xs text-slate-500">Sincronizando empresas en segundo plano...</p> : null}
            {loadError ? <p role="status" className="mt-3 text-xs text-amber-700">{loadError} Se muestran los registros disponibles de respaldo.</p> : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
