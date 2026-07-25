import Link from "next/link";
import { ArrowRight, MapPin, Building2 } from "lucide-react";

export default function EstacionamientoCard({ estacionamiento }) {
  return (
    <Link href={`/estacionamientos/${estacionamiento.id}`} className="group block rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#3150D8]">{estacionamiento.codigo}</p>
          <h3 className="mt-2 text-lg font-semibold text-[#041E42]">{estacionamiento.nombre}</h3>
        </div>
        <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{estacionamiento.estado}</span>
      </div>
      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[#3150D8]" /><span>{estacionamiento.direccion}</span></div>
        <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-[#3150D8]" /><span>{estacionamiento.ciudad}</span></div>
      </div>
      <div className="mt-5 flex items-center justify-between text-sm text-slate-500">
        <span>Capacidad {estacionamiento.capacidad}</span>
        <span className="inline-flex items-center gap-2 font-medium text-[#3150D8]">
          Ver detalle <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
