export default function ModalidadCobroBadge({ modalidad }) {
  const labels = {
    monthly: "Mensual",
    annual: "Anual",
    one_time: "Pago único",
    per_transaction: "Por transacción",
    mixed: "Mixto",
  };

  return <span className="inline-flex rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-semibold text-[#3150D8]">{labels[modalidad] || modalidad}</span>;
}
