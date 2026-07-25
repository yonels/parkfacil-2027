import Link from "next/link";
import { ArrowRight, Circle, MonitorSmartphone, MapPin, Clock3 } from "lucide-react";
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

function conexionTone(conexion) {
  const tones = {
    online: "text-[#16A34A]",
    warning: "text-[#F59E0B]",
    offline: "text-[#DC2626]",
    unknown: "text-[#64748B]",
  };

  return tones[conexion] ?? tones.unknown;
}

function estadoTone(estado) {
  const tones = {
    active: "border-emerald-200 bg-emerald-50 text-emerald-700",
    maintenance: "border-amber-200 bg-amber-50 text-amber-700",
    inactive: "border-rose-200 bg-rose-50 text-rose-700",
    retired: "border-slate-300 bg-slate-100 text-slate-700",
  };

  return tones[estado] ?? tones.inactive;
}

export default function DispositivoCard({ dispositivo }) {
  const estacionamiento = dispositivo.estacionamientoId && dispositivo.estacionamientoId !== "sin-asignar"
    ? getEstacionamientoById(dispositivo.estacionamientoId)
    : null;

  return (
    <Link href={`/dispositivos/${dispositivo.id}`} className="group flex h-full min-h-[286px] min-w-0 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#EEF4FF] text-[#3150D8]">
              <MonitorSmartphone className="h-4 w-4" />
            </span>
            <p className="text-sm font-semibold text-[#3150D8]">{dispositivo.codigo}</p>
          </div>
          <h3 className="mt-3 line-clamp-2 text-[21px] font-semibold leading-6 text-[#041E42]">{dispositivo.nombre}</h3>
        </div>
        <span className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${estadoTone(dispositivo.estado)}`}>{estadoLabel(dispositivo.estado)}</span>
      </div>

      <div className="mt-4 space-y-2 text-[15px] leading-5 text-slate-600">
        <div className="flex items-center gap-2">
          <MonitorSmartphone className="h-4 w-4 shrink-0 text-[#3150D8]" />
          <span className="truncate">{dispositivo.tipo}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-[#3150D8]" />
          <span className="truncate">{estacionamiento?.nombre ?? "Sin asignación"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 shrink-0 text-[#3150D8]" />
          <span className="truncate">Último contacto: {dispositivo.ultimaComunicacion || "No disponible"}</span>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm text-slate-500">
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${conexionTone(dispositivo.conexion)}`}>
          <Circle className="h-2.5 w-2.5 fill-current" />
          <span className="text-xs font-semibold">{conexionLabel(dispositivo.conexion)}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap font-semibold text-[#3150D8]">
          Ver detalle <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
