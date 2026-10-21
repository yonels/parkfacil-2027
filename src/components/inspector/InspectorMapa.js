import { MapPin } from "lucide-react";

// Mock visual del mapa (Etapa 1, sección 17): sin proveedor cartográfico
// real todavía -- deliberadamente fuera de alcance para no ampliar esta
// etapa. La estructura (contadores + lienzo) ya queda lista para que una
// etapa futura reemplace el lienzo por un mapa real con geolocalización,
// sin rediseñar el resto de la pantalla.
export default function InspectorMapa() {
  return (
    <div className="mx-auto w-full max-w-2xl p-4 pb-8">
      <h1 className="text-2xl font-black text-[#041E42]">Mapa</h1>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-emerald-50 p-3 text-center">
          <p className="text-2xl font-black text-emerald-700">12</p>
          <p className="text-xs font-bold text-emerald-800">Vigentes</p>
        </div>
        <div className="rounded-2xl bg-rose-50 p-3 text-center">
          <p className="text-2xl font-black text-rose-700">3</p>
          <p className="text-xs font-bold text-rose-800">Vencidos</p>
        </div>
        <div className="rounded-2xl bg-slate-100 p-3 text-center">
          <p className="text-2xl font-black text-slate-600">7</p>
          <p className="text-xs font-bold text-slate-700">Sin sesión</p>
        </div>
      </div>

      <div className="relative mt-4 grid aspect-square place-items-center overflow-hidden rounded-3xl bg-[#EEF4FF] shadow-sm" style={{ backgroundImage: "linear-gradient(#dbe6fb 1px, transparent 1px), linear-gradient(90deg, #dbe6fb 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
        <div className="text-center text-[#3150D8]">
          <MapPin className="mx-auto h-10 w-10" aria-hidden="true" />
          <p className="mt-2 max-w-[16rem] text-sm font-bold">Mapa en vivo disponible en una próxima etapa. Aquí se mostrará la ubicación de cada patente consultada.</p>
        </div>
      </div>
    </div>
  );
}
