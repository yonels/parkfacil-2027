// Marca de estadía con Pago liberado (SOL-2026-10-28-003, punto 3), usada en
// Movimientos (/operacion), su detalle y Recaudación.
export default function PagoLiberadoBadge({ className = "" }) {
  return <span title="Ingresó con una patente liberada: solo se cobra el tiempo fuera del período autorizado." className={`inline-flex whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ${className}`}>Pago liberado</span>;
}
