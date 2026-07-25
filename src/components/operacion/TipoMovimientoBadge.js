export default function TipoMovimientoBadge({ tipo }) {
  const labels = {
    entry: "Ingreso",
    exit: "Salida",
    manual_entry: "Ingreso manual",
    manual_exit: "Salida manual",
    ticket_opened: "Ticket abierto",
    ticket_closed: "Ticket cerrado",
    ticket_cancelled: "Ticket cancelado",
    access_denied: "Acceso denegado",
  };

  return <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{labels[tipo] || tipo}</span>;
}
