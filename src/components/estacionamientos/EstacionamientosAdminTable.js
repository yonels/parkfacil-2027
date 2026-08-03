"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, ChevronDown, ChevronRight, Eye, Pencil } from "lucide-react";
import EstadoEstacionamientoBadge from "./EstadoEstacionamientoBadge";
import TipoEstacionamientoBadge from "./TipoEstacionamientoBadge";

const headers = ["Código", "Estacionamiento", "Modelo", "Ciudad", "Estado", "Capacidad", "Ocupadas", "Disponibles", "Ocupación", "Acciones"];
const knownCompanies = {
  "Clínica Ramis": { id: "ramis", name: "Clínica Ramis", legalName: "Sociedad Médica Integral Clínica Ramis Ltda.", rut: "76.345.890-2" },
};

function valueOrDash(value) { return value === "" || value === null || value === undefined ? "—" : value; }
function companyKey(parking) { return parking.companyId || parking.companyName || "sin-empresa"; }

export default function EstacionamientosAdminTable({ results, companies = [] }) {
  const companyMap = useMemo(() => new Map(companies.map((company) => [
    company.id,
    { id: company.id, name: company.nombreFantasia || company.razonSocial, legalName: company.razonSocial, rut: [company.rutNumero, company.rutDv].filter(Boolean).join("-") },
  ])), [companies]);
  const groups = useMemo(() => {
    const grouped = new Map();
    results.forEach((parking) => {
      const key = companyKey(parking);
      const fallback = knownCompanies[parking.companyName] || { id: key, name: parking.companyName || "Sin empresa asociada", legalName: parking.companyName || "Sin empresa asociada", rut: "RUT no registrado" };
      const company = companyMap.get(parking.companyId) || fallback;
      if (!grouped.has(key)) grouped.set(key, { key, company, parkings: [] });
      grouped.get(key).parkings.push(parking);
    });
    return [...grouped.values()];
  }, [companyMap, results]);
  const [expanded, setExpanded] = useState({});
  const toggle = (key) => setExpanded((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="mt-5 min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{groups.length} {groups.length === 1 ? "empresa matriz" : "empresas matrices"} · {results.length} estacionamientos</p>
        <p className="hidden text-xs text-slate-400 sm:block">Expande una empresa para revisar sus estacionamientos</p>
      </div>
      <div className="w-full max-w-full overflow-x-auto rounded-2xl border border-slate-300">
        <table className="w-full min-w-[1180px] border-collapse bg-white text-left font-sans text-sm">
          <thead className="bg-[#E2F0D9] text-[#041E42]"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap border border-slate-300 px-3 py-3 font-semibold">{header}</th>)}</tr></thead>
          <tbody>
            {groups.map(({ key, company, parkings }) => {
              const capacity = parkings.reduce((sum, item) => sum + Number(item.metrics.capacity || 0), 0);
              const occupied = parkings.reduce((sum, item) => sum + Number(item.metrics.occupied || 0), 0);
              const available = Math.max(capacity - occupied, 0);
              const occupancy = capacity ? Math.round((occupied / capacity) * 100) : 0;
              const isCollapsed = !expanded[key];
              return [
                <tr key={`company-${key}`} className="bg-[#EEF4FF] hover:bg-[#E2F0D9]">
                  <td colSpan="5" className="border border-slate-300 px-3 py-3">
                    <button type="button" onClick={() => toggle(key)} className="flex w-full items-center gap-3 text-left">
                      {isCollapsed ? <ChevronRight className="h-5 w-5 text-[#3150D8]" /> : <ChevronDown className="h-5 w-5 text-[#3150D8]" />}
                      <Building2 className="h-5 w-5 text-[#3150D8]" />
                      <span><strong className="text-[#041E42]">{company.name}</strong><span className="ml-3 text-slate-600">RUT {company.rut}</span><small className="mt-0.5 block text-slate-500">{company.legalName} · {parkings.length} estacionamientos</small></span>
                    </button>
                  </td>
                  <td className="border border-slate-300 px-3 py-3 font-bold tabular-nums">{capacity}</td>
                  <td className="border border-slate-300 px-3 py-3 font-bold tabular-nums text-rose-700">{occupied}</td>
                  <td className="border border-slate-300 px-3 py-3 font-bold tabular-nums text-emerald-700">{available}</td>
                  <td className="border border-slate-300 px-3 py-3 font-bold tabular-nums">{occupancy}%</td>
                  <td className="border border-slate-300 px-3 py-3 text-xs font-semibold text-slate-500">Totales empresa</td>
                </tr>,
                ...(!isCollapsed ? parkings.map((parking) => (
                  <tr key={parking.id} className="even:bg-slate-50 hover:bg-[#FFF2CC]">
                    <td className="border border-slate-200 px-3 py-3 pl-11 font-semibold text-[#3150D8]">{parking.code}</td>
                    <td className="border border-slate-200 px-3 py-3 font-semibold text-[#041E42]">{parking.name}</td>
                    <td className="border border-slate-200 px-3 py-3">{parking.type ? <TipoEstacionamientoBadge type={parking.type} /> : "—"}</td>
                    <td className="border border-slate-200 px-3 py-3">{valueOrDash(parking.city)}</td>
                    <td className="border border-slate-200 px-3 py-3"><EstadoEstacionamientoBadge status={parking.status} /></td>
                    <td className="border border-slate-200 px-3 py-3 tabular-nums">{valueOrDash(parking.metrics.capacity)}</td>
                    <td className="border border-slate-200 px-3 py-3 tabular-nums text-rose-700">{valueOrDash(parking.metrics.occupied)}</td>
                    <td className="border border-slate-200 px-3 py-3 tabular-nums text-emerald-700">{valueOrDash(parking.metrics.available)}</td>
                    <td className="border border-slate-200 px-3 py-3 tabular-nums">{parking.metrics.occupancyPercentage}%</td>
                    <td className="border border-slate-200 px-3 py-3"><div className="flex gap-2"><Link href={`/estacionamientos/${parking.code}`} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold"><Eye className="h-3.5 w-3.5" /> Ver</Link><Link href={`/estacionamientos/${parking.code}/editar`} className="inline-flex items-center gap-1 rounded-full bg-[#F5F9FF] px-3 py-1.5 text-xs font-semibold text-[#3150D8]"><Pencil className="h-3.5 w-3.5" /> Modificar</Link></div></td>
                  </tr>
                )) : []),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
