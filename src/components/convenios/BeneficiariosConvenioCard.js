import { getTipoBeneficiarioLabel, formatDate, formatValorDemostrativo } from "@/data/convenios.mjs";

export default function BeneficiariosConvenioCard({ beneficiarios }) {
  if (!beneficiarios.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
        No hay beneficiarios registrados.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {beneficiarios.map((beneficiario) => (
        <div key={beneficiario.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-[#041E42]">{beneficiario.displayName || "No disponible"}</p>
          <p className="mt-1">Tipo: {getTipoBeneficiarioLabel(beneficiario.type)}</p>
          <p className="mt-1">Identificador: {beneficiario.identifier || "No disponible"}</p>
          <p className="mt-1">Patente: {beneficiario.licensePlate || "No disponible"}</p>
          <p className="mt-1">Estado: {beneficiario.active ? "Activo" : "Inactivo"}</p>
          <p className="mt-1">Vigencia: {formatDate(beneficiario.validFrom)} - {formatDate(beneficiario.validUntil)}</p>
          <p className="mt-1">Usos: {beneficiario.usageCount || 0}</p>
          <p className="mt-1">Consumo acumulado: {formatValorDemostrativo(beneficiario.accumulatedBenefit || 0)}</p>
          <p className="mt-1">Ultimo uso: {formatDate(beneficiario.lastUsedAt)}</p>
        </div>
      ))}
    </div>
  );
}
