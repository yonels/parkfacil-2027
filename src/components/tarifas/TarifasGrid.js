import SpreadsheetTable from "@/components/ui/SpreadsheetTable";
import EstadoTarifaBadge from "./EstadoTarifaBadge";
import TipoTarifaBadge from "./TipoTarifaBadge";
import ModalidadCobroBadge from "./ModalidadCobroBadge";
import { formatCurrency, getPlanTotalReferencial } from "@/data/tarifas.mjs";

export default function TarifasGrid({ tarifas }) {
  const columns = [
    { key: "codigo", label: "Código" }, { key: "nombre", label: "Plan", className: "font-semibold text-[#041E42]" },
    { key: "tipo", label: "Tipo", render: (r) => <TipoTarifaBadge tipo={r.tipo} /> },
    { key: "modalidadCobro", label: "Modalidad", render: (r) => <ModalidadCobroBadge modalidad={r.modalidadCobro} /> },
    { key: "monthlyFee", label: "Valor mensual", render: (r) => formatCurrency(r.monthlyFee, r.moneda) },
    { key: "total", label: "Total referencial", render: (r) => formatCurrency(getPlanTotalReferencial(r), r.moneda) },
    { key: "estacionamientosIncluidos", label: "Estacionamientos" }, { key: "dispositivosIncluidos", label: "Dispositivos" },
    { key: "usuariosIncluidos", label: "Usuarios" }, { key: "estado", label: "Estado", render: (r) => <EstadoTarifaBadge estado={r.estado} /> },
  ];
  return <SpreadsheetTable columns={columns} rows={tarifas} rowHref={(r) => `/tarifas/${r.id}`} minWidth={1400} />;
}
