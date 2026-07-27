export default function CredencialBadge({ tipo, estado }) {
  const labels = {
    license_plate: "Patente",
    rfid_card: "Tarjeta RFID",
    qr_code: "Código QR",
    qr_plate: "QR + Patente",
    mobile: "Credencial móvil",
    barcode: "Código de barras",
    pin: "PIN",
    biometric_reference: "Referencia biométrica",
    manual: "Autorización manual",
    other: "Otro",
  };

  const stateLabels = {
    active: "Activa",
    inactive: "Inactiva",
    suspended: "Suspendida",
    expired: "Vencida",
    revoked: "Revocada",
    lost: "Perdida",
    blocked: "Bloqueada",
    pending_activation: "Pendiente",
  };

  return <span className="inline-flex rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-semibold text-[#3150D8]">{labels[tipo] || tipo} · {stateLabels[estado] || estado}</span>;
}
