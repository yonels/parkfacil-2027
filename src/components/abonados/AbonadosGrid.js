import SpreadsheetTable from "@/components/ui/SpreadsheetTable";
import EstadoAbonadoBadge from "./EstadoAbonadoBadge";
import TipoAbonadoBadge from "./TipoAbonadoBadge";
import { resolveEmpresa, resolveEstacionamientos, getPatentePrincipal, getCredenciales, formatDate } from "@/data/abonados.mjs";

export default function AbonadosGrid({ abonados }) {
  const rows = abonados.map((item) => ({ ...item, empresa: resolveEmpresa(item)?.nombreFantasia, patente: getPatentePrincipal(item), estacionamientos: resolveEstacionamientos(item).length, credenciales: getCredenciales(item).length }));
  const columns = [
    { key: "identificador", label: "Identificador" }, { key: "nombre", label: "Abonado", className: "font-semibold text-[#041E42]" },
    { key: "empresa", label: "Empresa" }, { key: "patente", label: "Patente" }, { key: "correo", label: "Correo" },
    { key: "tipo", label: "Tipo", render: (r) => <TipoAbonadoBadge tipo={r.tipo} /> },
    { key: "estado", label: "Estado", render: (r) => <EstadoAbonadoBadge estado={r.estado} /> },
    { key: "estacionamientos", label: "Estacionamientos" }, { key: "credenciales", label: "Credenciales" },
    { key: "vigencia", label: "Vigencia", render: (r) => `${formatDate(r.fechaInicio)} - ${formatDate(r.fechaTermino)}` },
  ];
  return <SpreadsheetTable columns={columns} rows={rows} rowHref={(r) => `/abonados/${r.id}`} minWidth={1350} />;
}
