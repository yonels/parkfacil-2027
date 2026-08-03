"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, ChevronDown, ChevronRight, ExternalLink, Mail, MapPin, ParkingSquare, Phone, UserRound } from "lucide-react";
import EstadoEmpresaBadge from "./EstadoEmpresaBadge";
import TipoRelacionBadge from "./TipoRelacionBadge";
import { formatearRut } from "@/data/empresas.mjs";

const headers = ["Empresa matriz", "RUT", "Ciudad / País", "Relación", "Estado", "Estacionamientos", "Acciones"];

export default function EmpresasTable({ empresas }) {
  const [expanded, setExpanded] = useState({});
  const ordered = useMemo(() => [...empresas].sort((a, b) => a.nombreFantasia.localeCompare(b.nombreFantasia, "es")), [empresas]);
  const toggle = (id) => setExpanded((current) => ({ ...current, [id]: !current[id] }));

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <colgroup><col style={{ width: "20%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} /><col style={{ width: "13%" }} /><col style={{ width: "18%" }} /><col style={{ width: "14%" }} /><col style={{ width: "15%" }} /></colgroup>
          <thead className="bg-[#E2F0D9] text-xs font-bold uppercase tracking-wider text-[#041E42]">
            <tr>{headers.map((label) => <th key={label} className="border border-slate-300 px-4 py-3">{label}</th>)}</tr>
          </thead>
          <tbody>
            {ordered.map((empresa) => {
              const isExpanded = Boolean(expanded[empresa.id]);
              const rut = formatearRut(`${empresa.rutNumero}-${empresa.rutDv}`);
              const offStreet = empresa.estacionamientos.filter((parking) => parking.tipo === "OFF_STREET").length;
              const onStreet = empresa.estacionamientos.filter((parking) => parking.tipo === "ON_STREET").length;
              return [
                <tr key={`empresa-${empresa.id}`} className="bg-[#EEF4FF] hover:bg-[#E2F0D9]">
                  <td className="border border-slate-300 px-4 py-4">
                    <button type="button" onClick={() => toggle(empresa.id)} aria-expanded={isExpanded} className="flex w-full items-center gap-3 text-left">
                      {isExpanded ? <ChevronDown className="h-5 w-5 shrink-0 text-[#3150D8]" /> : <ChevronRight className="h-5 w-5 shrink-0 text-[#3150D8]" />}
                      <Building2 className="h-5 w-5 shrink-0 text-[#3150D8]" />
                      <span><strong className="block text-[#041E42]">{empresa.nombreFantasia}</strong><small className="mt-0.5 block text-slate-500">{empresa.razonSocial}</small></span>
                    </button>
                  </td>
                  <td className="whitespace-nowrap border border-slate-300 px-4 py-4 font-semibold text-[#3150D8]">{rut}</td>
                  <td className="border border-slate-300 px-4 py-4"><strong className="block font-medium">{empresa.ciudad || "—"}</strong><small className="text-slate-500">{empresa.pais || "—"}</small></td>
                  <td className="border border-slate-300 px-4 py-4"><TipoRelacionBadge tipo={empresa.tipoRelacion} /></td>
                  <td className="border border-slate-300 px-4 py-4"><EstadoEmpresaBadge estado={empresa.estado} /></td>
                  <td className="border border-slate-300 px-4 py-4"><span className="inline-flex items-center gap-2 font-semibold"><ParkingSquare className="h-4 w-4 text-[#3150D8]" />{empresa.estacionamientos.length} asociados</span><small className="mt-1 block text-slate-500">{offStreet} Off Street · {onStreet} On Street</small></td>
                  <td className="border border-slate-300 px-4 py-4"><Link href={`/empresas/${empresa.id}`} className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-2 font-semibold text-[#3150D8]"><ExternalLink className="h-4 w-4" />Ver empresa</Link></td>
                </tr>,
                ...(isExpanded ? [
                  <tr key={`detalle-${empresa.id}`} className="bg-white hover:bg-white">
                    <td colSpan="7" className="border border-slate-300 p-4">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <Detail icon={MapPin} label="Dirección" value={[empresa.direccion, empresa.comuna, empresa.region].filter(Boolean).join(", ")} />
                        <Detail icon={UserRound} label="Contacto principal" value={empresa.contactoPrincipal} />
                        <Detail icon={Mail} label="Correo" value={empresa.correo} />
                        <Detail icon={Phone} label="Teléfono" value={empresa.telefono} />
                        <Detail label="Giro" value={empresa.giro} />
                        <Detail label="Representante legal" value={empresa.representanteLegal} />
                      </div>
                      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full min-w-[850px] border-collapse text-left text-sm">
                          <thead className="bg-[#E2F0D9] text-[#041E42]"><tr>{["Código", "Estacionamiento", "Modelo", "Ciudad", "Estado", "Capacidad", "Acción"].map((label) => <th key={label} className="border border-slate-300 px-3 py-2 font-semibold">{label}</th>)}</tr></thead>
                          <tbody>{empresa.estacionamientos.length ? empresa.estacionamientos.map((parking) => <tr key={parking.id} className="even:bg-slate-50 hover:bg-[#FFF2CC]"><td className="border border-slate-200 px-3 py-2 font-semibold text-[#3150D8]">{parking.codigo}</td><td className="border border-slate-200 px-3 py-2 font-semibold">{parking.nombre}</td><td className="border border-slate-200 px-3 py-2">{parking.tipo || "—"}</td><td className="border border-slate-200 px-3 py-2">{parking.ciudad || "—"}</td><td className="border border-slate-200 px-3 py-2">{parking.estado || "—"}</td><td className="border border-slate-200 px-3 py-2 tabular-nums">{parking.capacidad ?? 0}</td><td className="border border-slate-200 px-3 py-2"><Link href={`/estacionamientos/${parking.codigo || parking.id}`} className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-[#3150D8]">Ver detalle <ExternalLink className="h-3.5 w-3.5" /></Link></td></tr>) : <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">No existen estacionamientos asociados.</td></tr>}</tbody>
                        </table>
                      </div>
                    </td>
                  </tr>,
                ] : []),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, value }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 flex items-start gap-2 text-slate-700">{Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#3150D8]" /> : null}{value || "—"}</p></div>;
}
