"use client";

export default function EstacionamientosError({ reset }) {
  return <div className="m-6 rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center"><p className="font-semibold text-rose-800">No fue posible cargar el módulo de estacionamientos.</p><button onClick={reset} className="mt-4 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white">Reintentar</button></div>;
}
