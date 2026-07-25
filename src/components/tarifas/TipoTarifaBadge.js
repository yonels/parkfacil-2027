export default function TipoTarifaBadge({ tipo }) {
  const labels = {
    monthly_subscription: "Suscripción mensual",
    per_transaction: "Por transacción",
    per_parking: "Por estacionamiento",
    equipment_bundle: "Paquete de equipamiento",
    implementation_only: "Solo implementación",
    custom: "Personalizado",
  };

  return <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{labels[tipo] || tipo}</span>;
}
