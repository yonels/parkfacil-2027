import Link from "next/link";
import { ArrowRight, MonitorSmartphone, MapPin } from "lucide-react";
import { getEstacionamientoById } from "@/data/estacionamientos.mjs";

function estadoLabel(estado) {
  const labels = {
    active: "Activo",
    inactive: "Inactivo",
    maintenance: "Mantenimiento",
    retired: "Retirado",
  };

  return labels[estado] ?? estado;
}

function conexionLabel(conexion) {
  const labels = {
    online: "En línea",
    offline: "Desconectado",
    warning: "Advertencia",
    unknown: "Desconocido",
  };

  return labels[conexion] ?? conexion;
}

export default function DispositivoCard({ dispositivo }) {
  const estacionamiento = dispositivo.estacionamientoId && dispositivo.estacionamientoId !== "sin-asignar"
    ? getEstacionamientoById(dispositivo.estacionamientoId)
    : null;

  return (
    <Link href={`/dispositivos/${dispositivo.id}`} className="group flex min-w-0 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#3150D8]">{dispositivo.codigo}</p>
          <h3 className="mt-2 text-lg font-semibold text-[#041E42]">{dispositivo.nombre}</h3>
        </div>
        <span className="shrink-0 self-start rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold tracking-wide text-slate-500">{estadoLabel(dispositivo.estado)}</span>
      </div>
      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <div className="flex items-center gap-2"><MonitorSmartphone className="h-4 w-4 text-[#3150D8]" /><span>{dispositivo.tipo}</span></div>
        <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[#3150D8]" /><span>{estacionamiento?.nombre ?? dispositivo.ubicacion}</span></div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm text-slate-500">
        <span>{conexionLabel(dispositivo.conexion)}</span>
        <span className="inline-flex items-center gap-2 font-medium text-[#3150D8]">
          Ver detalle <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
