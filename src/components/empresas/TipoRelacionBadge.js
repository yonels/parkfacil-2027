export default function TipoRelacionBadge({ tipo }) {
  const labels = {
    client: "Cliente",
    operator: "Operador",
    administrator: "Administrador",
    partner: "Aliado",
    supplier: "Proveedor",
  };

  return (
    <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
      {labels[tipo] ?? tipo}
    </span>
  );
}
