export default function TipoRelacionBadge({ tipo }) {
  const labels = {
    client: "Cliente",
    operator: "Operador",
    administrator: "Administrador",
    partner: "Aliado",
    supplier: "Proveedor",
  };

  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
      {labels[tipo] ?? tipo}
    </span>
  );
}
