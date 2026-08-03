import SpreadsheetTable from "@/components/ui/SpreadsheetTable";
import EstadoVisitaBadge from "./EstadoVisitaBadge";
import TipoVisitaBadge from "./TipoVisitaBadge";
import AprobacionVisitaBadge from "./AprobacionVisitaBadge";
import { resolveAnfitrion, resolveEmpresaAnfitriona, resolveEstacionamientos, formatDate, formatHour } from "@/data/visitas.mjs";

export default function VisitasGrid({ visitas }) {
  const rows = visitas.map((item) => ({ ...item, visitante: item.visitante?.nombre, identificador: item.visitante?.identificador || item.visitante?.rut, anfitrion: resolveAnfitrion(item)?.nombreCompleto, empresa: resolveEmpresaAnfitriona(item)?.nombreFantasia, parking: resolveEstacionamientos(item)[0]?.nombre, patente: item.vehicle?.licensePlate }));
  const columns = [
    { key: "codigo", label: "Código" }, { key: "visitante", label: "Visitante", className: "font-semibold text-[#041E42]" },
    { key: "identificador", label: "Identificación" }, { key: "empresa", label: "Empresa anfitriona" }, { key: "anfitrion", label: "Anfitrión" },
    { key: "parking", label: "Estacionamiento" }, { key: "patente", label: "Patente" },
    { key: "fecha", label: "Fecha y horario", render: (r) => `${formatDate(r.visitDate)} · ${formatHour(r.entryFrom)} - ${formatHour(r.exitUntil)}` },
    { key: "tipoVisita", label: "Tipo", render: (r) => <TipoVisitaBadge tipoVisita={r.tipoVisita} /> },
    { key: "estadoAprobacion", label: "Aprobación", render: (r) => <AprobacionVisitaBadge estadoAprobacion={r.estadoAprobacion} /> },
    { key: "estado", label: "Estado", render: (r) => <EstadoVisitaBadge estado={r.estado} /> },
  ];
  return <SpreadsheetTable columns={columns} rows={rows} rowHref={(r) => `/visitas/${r.id}`} minWidth={1650} />;
}
