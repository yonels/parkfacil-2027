import { calcularConsumoRestante, detectarTopeAlcanzado, detectarAltaUtilizacion, formatValorDemostrativo } from "@/data/convenios.mjs";

export default function UtilizacionConvenioCard({ convenio }) {
  const uso = convenio.utilizacion || {};
  const restante = calcularConsumoRestante(convenio);
  const topes = detectarTopeAlcanzado(convenio);
  const alta = detectarAltaUtilizacion(convenio);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      <p><span className="font-semibold text-[#041E42]">Total de usos:</span> {uso.totalUses || 0}</p>
      <p className="mt-1"><span className="font-semibold text-[#041E42]">Usos del dia:</span> {uso.usesToday || 0}</p>
      <p className="mt-1"><span className="font-semibold text-[#041E42]">Usos del mes:</span> {uso.usesThisMonth || 0}</p>
      <p className="mt-1"><span className="font-semibold text-[#041E42]">Beneficiarios unicos:</span> {uso.uniqueBeneficiaries || 0}</p>
      <p className="mt-1"><span className="font-semibold text-[#041E42]">Consumo acumulado:</span> {formatValorDemostrativo(uso.accumulatedDiscount || 0)}</p>
      <p className="mt-1"><span className="font-semibold text-[#041E42]">Usos restantes:</span> {restante.usosRestantes}</p>
      <p className="mt-1"><span className="font-semibold text-[#041E42]">Monto diario restante:</span> {formatValorDemostrativo(restante.montoDiarioRestante)}</p>
      <p className="mt-1"><span className="font-semibold text-[#041E42]">Monto mensual restante:</span> {formatValorDemostrativo(restante.montoMensualRestante)}</p>
      <p className="mt-1"><span className="font-semibold text-[#041E42]">Topes alcanzados:</span> {topes.algunTope ? "Si" : "No"}</p>
      <p className="mt-1"><span className="font-semibold text-[#041E42]">Alta utilizacion:</span> {alta ? "Si" : "No"}</p>
      <p className="mt-1"><span className="font-semibold text-[#041E42]">Ultima utilizacion:</span> {uso.lastUsedAt || "No disponible"}</p>
    </div>
  );
}
