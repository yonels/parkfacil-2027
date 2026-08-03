import SpreadsheetTable from "@/components/ui/SpreadsheetTable";
import EstadoContratoBadge from "./EstadoContratoBadge";
import TipoContratoBadge from "./TipoContratoBadge";
import { formatCurrency, resolveEmpresa, resolveEstacionamientos, resolveResponsable } from "@/data/contratos.mjs";

export default function ContratosGrid({ contratos }) {
  const rows = contratos.map((item) => ({ ...item, empresa: resolveEmpresa(item)?.razonSocial, parking: resolveEstacionamientos(item).map((p) => p.nombre).join(", "), responsable: resolveResponsable(item), valor: formatCurrency(item.monthlyValue, item.currency) }));
  const columns = [
    { key: "numeroContrato", label: "Contrato" }, { key: "empresa", label: "Empresa", className: "font-semibold text-[#041E42]" },
    { key: "parking", label: "Estacionamiento" }, { key: "tipo", label: "Tipo", render: (r) => <TipoContratoBadge tipo={r.tipo} /> },
    { key: "responsable", label: "Responsable" }, { key: "fechaInicio", label: "Inicio" }, { key: "fechaTermino", label: "Término" },
    { key: "valor", label: "Valor mensual" }, { key: "estado", label: "Estado", render: (r) => <EstadoContratoBadge estado={r.estado} /> },
  ];
  return <SpreadsheetTable columns={columns} rows={rows} rowHref={(r) => `/contratos/${r.id}`} minWidth={1350} />;
}
