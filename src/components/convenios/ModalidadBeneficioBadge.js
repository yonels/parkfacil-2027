import { getModalidadBeneficioLabel } from "@/data/convenios.mjs";

export default function ModalidadBeneficioBadge({ modalidad }) {
  return <span className="inline-flex rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-semibold text-[#3150D8]">{getModalidadBeneficioLabel(modalidad)}</span>;
}
