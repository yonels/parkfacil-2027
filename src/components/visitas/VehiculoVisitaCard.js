import { CarFront } from "lucide-react";
import { getTipoVehiculoLabel } from "@/data/visitas.mjs";

export default function VehiculoVisitaCard({ vehiculo }) {
  if (!vehiculo) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
        Invitado peatonal. No hay vehiculo asociado.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      <div className="flex items-center gap-2 text-[#041E42]">
        <CarFront className="h-4 w-4 text-[#3150D8]" />
        <span className="font-semibold">{vehiculo.licensePlate || "No disponible"}</span>
      </div>
      <p className="mt-2">Marca y modelo: {vehiculo.brand || "No disponible"} · {vehiculo.model || "No disponible"}</p>
      <p className="mt-1">Color: {vehiculo.color || "No disponible"}</p>
      <p className="mt-1">Tipo: {getTipoVehiculoLabel(vehiculo.vehicleType)}</p>
      <p className="mt-1">Espacio asignado: {vehiculo.parkingSpace || "No disponible"}</p>
      <p className="mt-1">Notas: {vehiculo.notes || "No disponible"}</p>
    </div>
  );
}
