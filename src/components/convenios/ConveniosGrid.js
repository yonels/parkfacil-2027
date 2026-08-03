import SpreadsheetTable from "@/components/ui/SpreadsheetTable";
import EstadoConvenioBadge from "./EstadoConvenioBadge";
import TipoConvenioBadge from "./TipoConvenioBadge";
import ModalidadBeneficioBadge from "./ModalidadBeneficioBadge";
import { resolveEmpresaPrincipal, resolveEstacionamientos, resolveUsuarioResponsable, formatDate, formatValorDemostrativo } from "@/data/convenios.mjs";

export default function ConveniosGrid({ convenios }) {
  const rows = convenios.map((item) => ({ ...item, empresa: resolveEmpresaPrincipal(item)?.nombreFantasia, parkings: resolveEstacionamientos(item).map((p) => p.nombre).join(", "), responsable: resolveUsuarioResponsable(item)?.nombreCompleto }));
  const columns = [
    { key: "codigo", label: "Código" }, { key: "nombre", label: "Convenio", className: "font-semibold text-[#041E42]" },
    { key: "empresa", label: "Empresa" }, { key: "parkings", label: "Estacionamientos" },
    { key: "tipo", label: "Tipo", render: (r) => <TipoConvenioBadge tipo={r.tipo} /> },
    { key: "modalidadBeneficio", label: "Beneficio", render: (r) => <ModalidadBeneficioBadge modalidad={r.modalidadBeneficio} /> },
    { key: "responsable", label: "Responsable" }, { key: "vigencia", label: "Vigencia", render: (r) => `${formatDate(r.vigencia.validFrom)} - ${formatDate(r.vigencia.validUntil)}` },
    { key: "beneficiarios", label: "Beneficiarios", render: (r) => r.beneficiarios.length },
    { key: "usos", label: "Usos", render: (r) => r.utilizacion.totalUses },
    { key: "consumo", label: "Consumo", render: (r) => formatValorDemostrativo(r.utilizacion.accumulatedDiscount) },
    { key: "estado", label: "Estado", render: (r) => <EstadoConvenioBadge estado={r.estado} /> },
  ];
  return <SpreadsheetTable columns={columns} rows={rows} rowHref={(r) => `/convenios/${r.id}`} minWidth={1750} />;
}
