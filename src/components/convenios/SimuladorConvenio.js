import { simularBeneficio, formatValorDemostrativo } from "@/data/convenios.mjs";

export default function SimuladorConvenio({ convenio, referenceDate = "2026-07-25T10:15:00" }) {
  const simulacion = simularBeneficio(convenio, 12500, referenceDate);

  return (
    <div className="rounded-2xl border border-[#3150D8]/25 bg-[#EEF4FF] p-5 text-sm text-slate-700">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#3150D8]">Simulacion demostrativa</p>
      <p className="mt-3"><span className="font-semibold text-[#041E42]">Monto base demostrativo:</span> {formatValorDemostrativo(simulacion.montoBase)}</p>
      <p className="mt-1"><span className="font-semibold text-[#041E42]">Beneficio aplicable:</span> {simulacion.beneficioAplicable}</p>
      <p className="mt-1"><span className="font-semibold text-[#041E42]">Descuento estimado:</span> {formatValorDemostrativo(simulacion.descuentoEstimado)}</p>
      <p className="mt-1"><span className="font-semibold text-[#041E42]">Monto final estimado:</span> {formatValorDemostrativo(simulacion.montoFinalEstimado)}</p>
      <p className="mt-1"><span className="font-semibold text-[#041E42]">Resultado:</span> {simulacion.aceptado ? "Aceptado" : "Rechazado"}</p>
      <p className="mt-1"><span className="font-semibold text-[#041E42]">Motivo:</span> {simulacion.motivo}</p>
      <p className="mt-2 font-semibold text-[#041E42]">Reglas evaluadas:</p>
      <ul className="mt-1 space-y-1">
        {simulacion.reglasEvaluadas.map((item) => <li key={item}>• {item}</li>)}
      </ul>
      <p className="mt-3 rounded-xl border border-[#3150D8]/25 bg-white px-3 py-2 font-medium text-[#041E42]">Esta simulacion no genera cobros ni descuentos reales.</p>
    </div>
  );
}
