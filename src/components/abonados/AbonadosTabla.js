import Link from "next/link";
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

const columns = [
  { key: "abonado", label: "Abonado" },
  { key: "rut", label: "RUT" },
  { key: "patente", label: "Patente" },
  { key: "empresa", label: "Empresa" },
  { key: "tipo", label: "Tipo" },
  { key: "inicio", label: "Inicio" },
  { key: "vencimiento", label: "Vencimiento" },
  { key: "estado", label: "Estado" },
  { key: "accion", label: "Acción" },
];

export default function AbonadosTabla({ abonados }) {
  const rows = abonados.map((abonado) => {
    const empresa = resolveEmpresa(abonado);
    const vigencia = getTextoVigencia(abonado, "2026-08-01");

    return {
      id: abonado.id,
      abonado: (
        <div className="min-w-[180px]">
          <p className="font-semibold text-[#041E42]">{abonado.nombre}</p>
          <p className="text-[11px] text-slate-500">{abonado.identificador}</p>
        </div>
      ),
      rut: formatValue(abonado.rut),
      patente: formatValue(getPatentePrincipal(abonado)),
      empresa: formatValue(empresa?.nombreFantasia),
      tipo: <TipoAbonadoBadge tipo={abonado.tipo} />,
      inicio: formatDate(abonado.fechaInicio),
      vencimiento: (
        <div className="min-w-[130px]">
          <p>{formatDate(abonado.fechaTermino)}</p>
          <div className="mt-1">
            <VigenciaAbonadoBadge texto={vigencia} />
          </div>
        </div>
      ),
      estado: <EstadoAbonadoBadge estado={abonado.estado} />,
      accion: (
        <Link href={`/abonados/${abonado.id}`} className="inline-flex whitespace-nowrap font-semibold text-[#3150D8] transition hover:text-[#1E5EFF] hover:underline">
          Ver detalle
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