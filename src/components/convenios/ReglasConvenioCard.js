import { describirBeneficio, formatValorDemostrativo } from "@/data/convenios.mjs";

export default function ReglasConvenioCard({ convenio }) {
  const beneficio = convenio.beneficio || {};

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      <p className="font-semibold text-[#041E42]">{describirBeneficio(convenio)}</p>
      <p className="mt-2">Tope descuento: {formatValorDemostrativo(beneficio.maximumDiscount || 0)}</p>
      <p className="mt-1">Tope por dia: {formatValorDemostrativo(beneficio.maximumAmountPerDay || 0)}</p>
      <p className="mt-1">Tope por mes: {formatValorDemostrativo(beneficio.maximumAmountPerMonth || 0)}</p>
      <p className="mt-1">Maximo de usos: {beneficio.maximumUses || 0}</p>
      <p className="mt-1">Acumulable: {beneficio.cumulative ? "Si" : "No"}</p>
      <p className="mt-1">Entradas multiples: {beneficio.multipleEntries ? "Si" : "No"}</p>
      <p className="mt-1">Requiere aprobacion: {beneficio.requiresApproval ? "Si" : "No"}</p>
      <p className="mt-1">Aplicacion automatica: {beneficio.appliesAutomatically ? "Si" : "No"}</p>
      <p className="mt-1">Notas: {beneficio.notes || "No disponible"}</p>
    </div>
  );
}
