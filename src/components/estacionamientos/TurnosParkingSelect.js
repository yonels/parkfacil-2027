"use client";

import { useRouter } from "next/navigation";

// Selector de Turnos (SOL-2026-10-29-005): siempre muestra el estacionamiento
// cargado (controlado, sin que el navegador restaure una opción anterior) y
// carga el elegido al cambiarlo.
export default function TurnosParkingSelect({ parkings, selectedCode }) {
  const router = useRouter();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select
        name="estacionamiento"
        aria-label="Estacionamiento"
        autoComplete="off"
        value={selectedCode}
        onChange={(event) => router.push(`/turnos?estacionamiento=${encodeURIComponent(event.target.value)}`)}
        className="min-w-[220px] flex-1 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]"
      >
        {parkings.map((item) => (
          <option key={item.code} value={item.code}>{item.label}</option>
        ))}
      </select>
    </div>
  );
}
