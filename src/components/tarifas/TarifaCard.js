import Link from "next/link";
import { BadgeDollarSign, Boxes, Building2, CalendarDays, HardHat, MonitorSmartphone } from "lucide-react";
import EstadoTarifaBadge from "@/components/tarifas/EstadoTarifaBadge";
import TipoTarifaBadge from "@/components/tarifas/TipoTarifaBadge";
import ModalidadCobroBadge from "@/components/tarifas/ModalidadCobroBadge";
import { formatCurrency, getPlanTotalReferencial } from "@/data/tarifas.mjs";

export default function TarifaCard({ tarifa }) {
  return (
    <Link href={`/tarifas/${tarifa.id}`} className="group block rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#3150D8]">{tarifa.codigo}</p>
          <h3 className="mt-1 text-lg font-semibold text-[#041E42]">{tarifa.nombre}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <EstadoTarifaBadge estado={tarifa.estado} />
          <TipoTarifaBadge tipo={tarifa.tipo} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
        <div className="flex items-center gap-2"><BadgeDollarSign className="h-4 w-4 text-[#3150D8]" /><span>{formatCurrency(tarifa.monthlyFee, tarifa.moneda)}</span></div>
        <div className="flex items-center gap-2"><MonitorSmartphone className="h-4 w-4 text-[#3150D8]" /><span>{tarifa.dispositivosIncluidos} dispositivos</span></div>
        <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-[#3150D8]" /><span>{tarifa.estacionamientosIncluidos} estacionamientos</span></div>
        <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#3150D8]" /><span>{tarifa.fechaCreacion}</span></div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="flex items-center gap-2 text-sm text-slate-600"><HardHat className="h-4 w-4 text-[#3150D8]" /><span>{tarifa.usuariosIncluidos} usuarios</span></div>
        <div className="flex items-center gap-2 text-sm text-slate-600"><Boxes className="h-4 w-4 text-[#3150D8]" /><span>Total referencial: {formatCurrency(getPlanTotalReferencial(tarifa), tarifa.moneda)}</span></div>
      </div>
      <div className="mt-3 flex justify-end">
        <ModalidadCobroBadge modalidad={tarifa.modalidadCobro} />
      </div>
    </Link>
  );
}
