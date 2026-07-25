export default function TipoAbonadoBadge({ tipo }) {
  const labels = {
    individual: "Particular",
    company_employee: "Colaborador de empresa",
    resident: "Residente",
    tenant: "Arrendatario",
    supplier: "Proveedor",
    courtesy: "Cortesía",
    temporary: "Temporal",
    other: "Otro",
  };

  return <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{labels[tipo] || tipo}</span>;
}
