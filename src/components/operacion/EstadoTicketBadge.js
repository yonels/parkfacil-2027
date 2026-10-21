// Estados reales de parking_stays (constraint en
// supabase/migrations/20260731130000_parking_stays_tickets.sql): OPEN/PAID/
// CANCELLED. Ver src/lib/offStreetOperationsCore.mjs (statusLabel) para la
// misma correspondencia usada del lado servidor.
export default function EstadoTicketBadge({ estado }) {
  const labels = {
    OPEN: "Abierto",
    PAID: "Pagado",
    CANCELLED: "Anulado",
  };

  const tones = {
    OPEN: "bg-emerald-100 text-emerald-700",
    PAID: "bg-[#EEF4FF] text-[#3150D8]",
    CANCELLED: "bg-rose-100 text-rose-700",
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tones[estado] || "bg-slate-100 text-slate-700"}`}>{labels[estado] || estado || "—"}</span>;
}
