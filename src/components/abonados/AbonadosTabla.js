"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Pencil } from "lucide-react";
import EstadoAbonadoBadge from "@/components/abonados/EstadoAbonadoBadge";
import { getCredenciales, getVehiculos, formatDate } from "@/data/abonados.mjs";

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "No registrado";
  return value;
}

function SortButton({ label, sortKey, currentSortKey, sortDirection, onSort }) {
  const Icon = currentSortKey !== sortKey ? ArrowUpDown : sortDirection === "asc" ? ArrowUp : ArrowDown;
  return (
    <button type="button" onClick={(event) => { event.stopPropagation(); onSort(sortKey); }} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-[#3150D8]">
      {label}<Icon className="h-3.5 w-3.5" />
    </button>
  );
}

export default function AbonadosTabla({ abonados, sortKey, sortDirection, onSort }) {
  const router = useRouter();

  const openRow = (id) => router.push(`/abonados/${id}`);
  const handleKeyDown = (event, id) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openRow(id);
    }
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-[1180px] w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600">
          <tr className="border-b border-slate-200">
            <th className="px-3 py-2"><SortButton label="Codigo" sortKey="codigo" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></th>
            <th className="px-3 py-2"><SortButton label="Nombre completo" sortKey="nombre" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></th>
            <th className="px-3 py-2">RUT</th>
            <th className="px-3 py-2">Telefono</th>
            <th className="px-3 py-2">Correo</th>
            <th className="px-3 py-2">Responsable</th>
            <th className="px-3 py-2"><SortButton label="Estado" sortKey="estado" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></th>
            <th className="px-3 py-2"><SortButton label="Inicio" sortKey="inicio" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></th>
            <th className="px-3 py-2"><SortButton label="Termino" sortKey="termino" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></th>
            <th className="px-3 py-2">Vehiculos</th>
            <th className="px-3 py-2">Credenciales</th>
            <th className="px-3 py-2"><SortButton label="Ultima actualizacion" sortKey="updatedAt" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></th>
            <th className="px-3 py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {abonados.map((abonado) => {
            const vehiculos = getVehiculos(abonado);
            const credenciales = getCredenciales(abonado);
            return (
              <tr key={abonado.id} tabIndex={0} onClick={() => openRow(abonado.id)} onKeyDown={(event) => handleKeyDown(event, abonado.id)} className="cursor-pointer border-b border-slate-100 text-slate-700 outline-none transition hover:bg-[#EEF4FF] focus:bg-[#EEF4FF] focus:ring-2 focus:ring-inset focus:ring-[#3150D8]">
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-[#3150D8]">{formatValue(abonado.codigo)}</td>
                <td className="min-w-[190px] px-3 py-2 font-semibold text-[#041E42]">{formatValue(abonado.nombre)}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatValue(abonado.rut)}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatValue(abonado.telefono)}</td>
                <td className="max-w-[220px] truncate px-3 py-2" title={abonado.correo || ""}>{formatValue(abonado.correo)}</td>
                <td className="max-w-[200px] truncate px-3 py-2" title={abonado.responsable?.nombreCompleto || abonado.responsableId || ""}>{formatValue(abonado.responsable?.nombreCompleto || abonado.responsableId)}</td>
                <td className="px-3 py-2"><EstadoAbonadoBadge estado={abonado.estado} /></td>
                <td className="whitespace-nowrap px-3 py-2">{formatDate(abonado.fechaInicio)}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatDate(abonado.fechaTermino)}</td>
                <td className="px-3 py-2">{vehiculos.length ? vehiculos.map((item) => item.licensePlate).join("; ") : "Sin vehiculos"}</td>
                <td className="px-3 py-2">{credenciales.length ? credenciales.map((item) => item.numero).join("; ") : "Sin credenciales"}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatDate(abonado.updatedAt)}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                    <Link href={`/abonados/${abonado.id}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-semibold text-[#3150D8]"><Eye className="h-3.5 w-3.5" />Ver</Link>
                    <Link href={`/abonados/${abonado.id}/editar`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-semibold text-[#041E42]"><Pencil className="h-3.5 w-3.5" />Editar</Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
