import StatusBadge from "@/components/ui/StatusBadge";
import { STATE_LABELS } from "@/lib/estacionamientos.mjs";

const variants = { ACTIVE: "positive", INACTIVE: "error", MAINTENANCE: "warning" };

export default function EstadoEstacionamientoBadge({ status }) {
  return <StatusBadge variant={variants[status] || "neutral"} uppercase={false}>{STATE_LABELS[status] || status}</StatusBadge>;
}
