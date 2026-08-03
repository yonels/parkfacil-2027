import { TYPE_LABELS } from "@/lib/estacionamientos.mjs";

export default function TipoEstacionamientoBadge({ type }) {
  return <span className="inline-flex rounded-full border border-[#DCE8FF] bg-[#F5F9FF] px-2.5 py-1 text-xs font-semibold text-[#3150D8]">{TYPE_LABELS[type] || type}</span>;
}
