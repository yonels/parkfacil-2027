export default function TipoContratoBadge({ tipo }) {
  const labels = {
    software_service: "Servicio de software",
    parking_operation: "Operación de estacionamiento",
    equipment_lease: "Arriendo de equipamiento",
    support_service: "Servicio de soporte",
    implementation: "Implementación",
    partnership: "Alianza comercial",
    other: "Otro",
  };

  return <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{labels[tipo] || tipo}</span>;
}
