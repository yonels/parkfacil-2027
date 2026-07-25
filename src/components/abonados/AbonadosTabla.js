import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye } from "lucide-react";
import DataTable from "@/components/dashboard/DataTable";
import EstadoAbonadoBadge from "@/components/abonados/EstadoAbonadoBadge";
import TipoAbonadoBadge from "@/components/abonados/TipoAbonadoBadge";
import VigenciaAbonadoBadge from "@/components/abonados/VigenciaAbonadoBadge";
import { resolveEmpresa, getPatentePrincipal, getTextoVigencia, formatDate } from "@/data/abonados.mjs";

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "No registrado";
  }

  return value;
}

function SortLabel({ label, sortKey, currentSortKey, sortDirection, onSort }) {
  const Icon = currentSortKey !== sortKey || !sortDirection
    ? ArrowUpDown
    : sortDirection === "asc"
      ? ArrowUp
      : ArrowDown;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="inline-flex items-center gap-1.5 text-left text-xs font-semibold text-slate-500 transition hover:text-[#3150D8]"
      aria-label={`Ordenar por ${label}`}
    >
      <span>{label}</span>
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function DateCell({ date, vigencia }) {
  return (
    <div className="min-w-[130px]">
      <p>{formatDate(date)}</p>
      <div className="mt-1">
        <VigenciaAbonadoBadge texto={vigencia} />
      </div>
    </div>
  );
}

export default function AbonadosTabla({ abonados, sortKey, sortDirection, onSort }) {
  const columns = [
    { key: "abonado", label: <SortLabel label="Abonado" sortKey="abonado" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /> },
    { key: "rut", label: "RUT" },
    { key: "patente", label: "Patente" },
    { key: "empresa", label: <SortLabel label="Empresa" sortKey="empresa" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /> },
    { key: "tipo", label: <SortLabel label="Tipo" sortKey="tipo" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /> },
    { key: "inicio", label: <SortLabel label="Inicio" sortKey="inicio" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /> },
    { key: "vencimiento", label: <SortLabel label="Vencimiento" sortKey="vencimiento" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /> },
    { key: "estado", label: <SortLabel label="Estado" sortKey="estado" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /> },
    { key: "accion", label: "Acción" },
  ];

  const rows = abonados.map((abonado) => {
    const empresa = resolveEmpresa(abonado);
    const vigencia = getTextoVigencia(abonado, "2026-08-01");

    return {
      id: abonado.id,
      abonado: (
        <div className="min-w-[180px]">
          <p className="font-semibold text-[#041E42]">{abonado.nombre}</p>
          <p className="text-[11px] text-slate-500">ID: {abonado.identificador}</p>
        </div>
      ),
      rut: formatValue(abonado.rut),
      patente: formatValue(getPatentePrincipal(abonado)),
      empresa: (
        <span className="block max-w-[180px] truncate" title={formatValue(empresa?.nombreFantasia)}>
          {formatValue(empresa?.nombreFantasia)}
        </span>
      ),
      tipo: <TipoAbonadoBadge tipo={abonado.tipo} />,
      inicio: <DateCell date={abonado.fechaInicio} vigencia={vigencia} />,
      vencimiento: <DateCell date={abonado.fechaTermino} vigencia={vigencia} />,
      estado: <EstadoAbonadoBadge estado={abonado.estado} />,
      accion: (
        <Link
          href={`/abonados/${abonado.id}`}
          aria-label={`Ver detalle de ${abonado.nombre}`}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#3150D8] transition hover:border-[#3150D8] hover:bg-[#EEF4FF] focus:outline-none focus:ring-2 focus:ring-[#1E5EFF]/20"
        >
          <Eye className="h-4 w-4" />
          <span className="whitespace-nowrap">Ver detalle</span>
        </Link>
      ),
    };
  });

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <DataTable columns={columns} rows={rows} />
    </div>
  );
}